import type { FetchLike } from "../http.ts";
import { describe, expect, it, vi } from "vitest";
import { SHIPMENT_LEAD_TIME, shipmentBase } from "./fixtures/shipments.ts";
import { getMercadoLivreLabel, getMercadoLivreShipping } from "./shipping.ts";
const store = { externalShopId: "99", accessToken: "test-token" };
const order = { seller: { id: 99 } };
const shipment = { ...shipmentBase, id: 123 };
// Hosted View: only ids and types, in no promised order; returns come before the sale here.
const shipmentRefs = [
  { id: 9, type: "return" },
  { id: 123, type: "forward" },
];
function setup(overrides = {}, refs: unknown = shipmentRefs) {
  const request = vi
    .fn<FetchLike>()
    .mockResolvedValueOnce(Response.json(order))
    .mockResolvedValueOnce(Response.json(refs))
    .mockResolvedValueOnce(Response.json({ ...shipment, ...overrides }));
  return {
    request,
    config: {
      clientId: "client",
      clientSecret: "secret",
      fetchImplementation: request,
      retry: { retries: 0 },
    },
  };
}
describe("Mercado Livre shipping", () => {
  it("lists the order's shipments, then loads the sale shipment with address and tracking", async () => {
    const { request, config } = setup({}, [{ id: 123, type: "forward" }]);
    expect(await getMercadoLivreShipping(config, store, "55")).toMatchObject({
      shipmentId: "123",
      status: "ready_to_ship",
      trackingStatus: null,
      trackingCode: "ML123",
      carrier: "Mercado Envios",
      address: { recipient: "Maria Silva", state: "SP", postalCode: "01001000" },
    });
    expect(request.mock.calls[1]?.[0]).toBe("https://api.mercadolibre.com/orders/55/shipments");
    expect(request.mock.calls[2]?.[0]).toBe("https://api.mercadolibre.com/shipments/123");
    const headers = new Headers(request.mock.calls[2]?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-token");
    expect(headers.get("x-format-new")).toBe("true");
  });
  it("reads a blank tracking number and carrier as absent", async () => {
    const { config } = setup({ tracking_number: "", tracking_method: " " }, [
      { id: 123, type: "forward" },
    ]);
    expect(await getMercadoLivreShipping(config, store, "55")).toMatchObject({
      trackingCode: null,
      carrier: null,
    });
  });

  it("reads the delivery estimate and the dispatch deadline from lead_time", async () => {
    const { config } = setup({ lead_time: SHIPMENT_LEAD_TIME }, [{ id: 123, type: "forward" }]);
    const shipping = await getMercadoLivreShipping(config, store, "55");
    expect(shipping.estimatedDeliveryAt?.toISOString()).toBe("2026-10-20T03:00:00.000Z");
    expect(shipping.dispatchDeadlineAt?.toISOString()).toBe("2026-10-16T03:00:00.000Z");
  });
  it("leaves the estimate empty when the shipment has none or an unreadable one", async () => {
    for (const leadTime of [undefined, null, { estimated_delivery_time: { date: "amanhã" } }]) {
      const { config } = setup({ lead_time: leadTime }, [{ id: 123, type: "forward" }]);
      expect(await getMercadoLivreShipping(config, store, "55")).toMatchObject({
        estimatedDeliveryAt: null,
        dispatchDeadlineAt: null,
      });
    }
  });
  it("keeps the dispatch deadline when the estimate is malformed or not firm", async () => {
    for (const estimate of [
      { type: "unknown", date: null },
      { type: "unknown_frame", date: "2026-10-20T00:00:00.000-03:00" },
    ]) {
      const { config } = setup(
        { lead_time: { ...SHIPMENT_LEAD_TIME, estimated_delivery_time: estimate } },
        [{ id: 123, type: "forward" }],
      );
      const shipping = await getMercadoLivreShipping(config, store, "55");
      expect(shipping.estimatedDeliveryAt).toBeNull();
      expect(shipping.dispatchDeadlineAt?.toISOString()).toBe("2026-10-16T03:00:00.000Z");
    }
  });
  it("maps the tracking status of the sale shipment", async () => {
    const { config } = setup({ status: "not_delivered", substatus: "returned" }, [
      { id: 123, type: "forward" },
    ]);
    expect(await getMercadoLivreShipping(config, store, "55")).toMatchObject({
      trackingStatus: "returned",
    });
  });
  it("reports the buyer's return parcel once it reached the seller", async () => {
    const { request, config } = setup();
    request.mockResolvedValueOnce(
      Response.json({ ...shipment, id: 9, status: "delivered", substatus: null }),
    );
    expect(await getMercadoLivreShipping(config, store, "55")).toMatchObject({
      shipmentId: "123",
      buyerReturnDelivered: true,
    });
    expect(request.mock.calls[3]?.[0]).toBe("https://api.mercadolibre.com/shipments/9");
  });
  it("does not count a return still on its way", async () => {
    const { request, config } = setup();
    request.mockResolvedValueOnce(Response.json({ ...shipment, id: 9, status: "shipped" }));
    expect(await getMercadoLivreShipping(config, store, "55")).toMatchObject({
      buyerReturnDelivered: false,
    });
  });
  it("asks for no return shipment when the order has none", async () => {
    const { request, config } = setup({}, [{ id: 123, type: "forward" }]);
    expect(await getMercadoLivreShipping(config, store, "55")).toMatchObject({
      buyerReturnDelivered: false,
    });
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("says when the order has no shipment yet (HTTP 204)", async () => {
    const request = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(Response.json(order))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(
      getMercadoLivreShipping(
        { clientId: "c", clientSecret: "s", fetchImplementation: request, retry: { retries: 0 } },
        store,
        "55",
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining("ainda não criou o envio") });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([
    [[{ id: 9, type: "return" }]],
    [
      [
        { id: 1, type: "forward" },
        { id: 2, type: "forward" },
      ],
    ],
  ])("refuses anything but exactly one sale shipment: %j", async (refs) => {
    const { request, config } = setup({}, refs);
    await expect(getMercadoLivreShipping(config, store, "55")).rejects.toMatchObject({
      message: expect.stringContaining("único envio"),
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("gets the official PDF only for printable shipments", async () => {
    const { request, config } = setup();
    request.mockResolvedValueOnce(new Response("%PDF-1.4 test"));
    const pdf = await getMercadoLivreLabel(config, store, "55");
    expect(new TextDecoder().decode(pdf)).toBe("%PDF-1.4 test");
    expect(request.mock.calls[3]?.[0]).toBe(
      "https://api.mercadolibre.com/shipment_labels?shipment_ids=123&response_type=pdf",
    );
  });
  it.each([{ status: "pending" }, { logistic_type: "fulfillment" }, { mode: "custom" }])(
    "rejects unavailable label %j",
    async (overrides) => {
      const { request, config } = setup(overrides);
      await expect(getMercadoLivreLabel(config, store, "55")).rejects.toMatchObject({
        code: "EXTERNAL_PROVIDER",
      });
      expect(request).toHaveBeenCalledTimes(3);
    },
  );
  it("rejects an order of another seller and does not request its address", async () => {
    const { request, config } = setup();
    request.mockReset().mockResolvedValueOnce(Response.json({ seller: { id: 100 } }));
    await expect(getMercadoLivreShipping(config, store, "55")).rejects.toMatchObject({
      code: "EXTERNAL_PROVIDER",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("rejects HTML or JSON masquerading as a PDF", async () => {
    const { request, config } = setup();
    request.mockResolvedValueOnce(new Response("<html>error</html>"));
    await expect(getMercadoLivreLabel(config, store, "55")).rejects.toMatchObject({
      code: "EXTERNAL_PROVIDER",
    });
  });
});
