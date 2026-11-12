import type { FetchLike } from "../http.ts";
import { describe, expect, it, vi } from "vitest";
import { SHIPMENT_LEAD_TIME, SHIPMENT_SLA, shipmentBase } from "./fixtures/shipments.ts";
import { hasMarketplaceCause } from "../errors.ts";
import { zipArchive } from "../testing/zip-archive.ts";
import {
  getMercadoLivreLabel,
  getMercadoLivreLabels,
  getMercadoLivreShipping,
  LABEL_NOT_READY_CAUSE,
  readMercadoLivreShippingAddress,
} from "./shipping.ts";
const store = { externalShopId: "99", accessToken: "test-token" };
const order = { seller: { id: 99 } };
const shipment = { ...shipmentBase, id: 123 };
// Hosted View: only ids and types, in no promised order; returns come before the sale here.
const shipmentRefs = [
  { id: 9, type: "return" },
  { id: 123, type: "forward" },
];
function setup(overrides = {}, refs: unknown = shipmentRefs) {
  // Any call past the scripted ones (the dispatch SLA) answers an empty SLA.
  const request = vi
    .fn<FetchLike>(async () => Response.json({}))
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
  it("reads the buyer's address from the sale shipment without the return lookups", async () => {
    const { request, config } = setup();
    expect(await readMercadoLivreShippingAddress(config, store, "55")).toMatchObject({
      kind: "available",
      address: { recipient: "Maria Silva", state: "SP", postalCode: "01001000" },
    });
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("answers not provided when the sale shipment has no address", async () => {
    const { config } = setup({ receiver_address: null, destination: undefined }, [
      { id: 123, type: "forward" },
    ]);
    expect(await readMercadoLivreShippingAddress(config, store, "55")).toEqual({
      kind: "unavailable",
      reason: "not_provided",
    });
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
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "https://api.mercadolibre.com/orders/55",
      "https://api.mercadolibre.com/orders/55/shipments",
      "https://api.mercadolibre.com/shipments/123",
      "https://api.mercadolibre.com/shipments/123/sla",
    ]);
  });
  it("reads the dispatch deadline from the SLA, which replaced lead_time's handling limit", async () => {
    const { request, config } = setup(
      { lead_time: { estimated_delivery_time: SHIPMENT_LEAD_TIME.estimated_delivery_time } },
      [{ id: 123, type: "forward" }],
    );
    request.mockResolvedValueOnce(Response.json(SHIPMENT_SLA));

    const shipping = await getMercadoLivreShipping(config, store, "55");

    expect(shipping.dispatchDeadlineAt?.toISOString()).toBe("2026-10-17T02:59:59.000Z");
    const headers = new Headers(request.mock.calls[3]?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-token");
  });
  it("prefers the SLA over the deprecated handling limit when both come", async () => {
    const { request, config } = setup({ lead_time: SHIPMENT_LEAD_TIME }, [
      { id: 123, type: "forward" },
    ]);
    request.mockResolvedValueOnce(Response.json(SHIPMENT_SLA));

    const shipping = await getMercadoLivreShipping(config, store, "55");

    expect(shipping.dispatchDeadlineAt?.toISOString()).toBe("2026-10-17T02:59:59.000Z");
  });
  it("keeps the handling limit when the SLA cannot be read", async () => {
    const { request, config } = setup({ lead_time: SHIPMENT_LEAD_TIME }, [
      { id: 123, type: "forward" },
    ]);
    request.mockResolvedValueOnce(new Response("{}", { status: 404 }));

    const shipping = await getMercadoLivreShipping(config, store, "55");

    expect(shipping.dispatchDeadlineAt?.toISOString()).toBe("2026-10-16T03:00:00.000Z");
  });
  it.each([{ status: "shipped" }, { status: "cancelled" }, { logistic_type: "fulfillment" }])(
    "asks no SLA for a shipment that has none to keep: %j",
    async (overrides) => {
      const { request, config } = setup(overrides, [{ id: 123, type: "forward" }]);

      await getMercadoLivreShipping(config, store, "55");

      expect(request).toHaveBeenCalledTimes(3);
    },
  );
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
    const label = await getMercadoLivreLabel(config, store, "55", "pdf");
    expect(label.file.format).toBe("pdf");
    expect(new TextDecoder().decode(label.file.bytes)).toBe("%PDF-1.4 test");
    expect(label.shipmentId).toBe("123");
    expect(request.mock.calls[3]?.[0]).toBe(
      "https://api.mercadolibre.com/shipment_labels?shipment_ids=123&response_type=pdf",
    );
  });
  it.each([{ status: "pending" }, { logistic_type: "fulfillment" }, { mode: "custom" }])(
    "rejects unavailable label %j",
    async (overrides) => {
      const { request, config } = setup(overrides);
      await expect(getMercadoLivreLabel(config, store, "55", "pdf")).rejects.toMatchObject({
        code: "EXTERNAL_PROVIDER",
      });
      expect(request).toHaveBeenCalledTimes(3);
    },
  );
  it("marks a label the marketplace has not released yet, so it can be retried later", async () => {
    const { config } = setup({ status: "pending" });

    const failure = await getMercadoLivreLabel(config, store, "55", "pdf").catch(
      (error: unknown) => error,
    );

    expect(hasMarketplaceCause(failure, LABEL_NOT_READY_CAUSE)).toBe(true);
  });
  it("prints the printable orders of a batch in one PDF and reports the others", async () => {
    // The orders are looked up in parallel: each answer follows the address asked.
    const answers: Record<string, () => Response> = {
      "/orders/55": () => Response.json(order),
      "/orders/56": () => Response.json(order),
      "/orders/55/shipments": () => Response.json([{ id: 123, type: "forward" }]),
      "/orders/56/shipments": () => Response.json([{ id: 124, type: "forward" }]),
      "/shipments/123": () => Response.json(shipment),
      "/shipments/124": () => Response.json({ ...shipment, id: 124, status: "pending" }),
      "/shipment_labels": () => new Response("%PDF-1.4 both"),
    };
    const request = vi.fn<FetchLike>(async (url) => {
      const answer = answers[new URL(url).pathname];
      if (answer === undefined) {
        throw new Error(`Unexpected request ${url}`);
      }
      return answer();
    });
    const config = {
      clientId: "c",
      clientSecret: "s",
      fetchImplementation: request,
      retry: { retries: 0 },
    };

    const batch = await getMercadoLivreLabels(config, store, ["55", "56"], "pdf");

    expect(batch.printed).toEqual([{ orderId: "55", shipmentId: "123" }]);
    expect(batch.refused.map((refusal) => refusal.orderId)).toEqual(["56"]);
    expect(hasMarketplaceCause(batch.refused[0]?.error, LABEL_NOT_READY_CAUSE)).toBe(true);
    expect(request.mock.calls.at(-1)?.[0]).toBe(
      "https://api.mercadolibre.com/shipment_labels?shipment_ids=123&response_type=pdf",
    );
  });
  it("asks for no PDF when no order of the batch can print", async () => {
    const { request, config } = setup({ status: "pending" });

    const batch = await getMercadoLivreLabels(config, store, ["55"], "pdf");

    expect(batch.file).toBeNull();
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("rejects an order of another seller and does not request its address", async () => {
    const { request, config } = setup();
    request.mockReset().mockResolvedValueOnce(Response.json({ seller: { id: 100 } }));
    await expect(getMercadoLivreShipping(config, store, "55")).rejects.toMatchObject({
      code: "EXTERNAL_PROVIDER",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("gets the Zebra (ZPL) label from the ZIP Mercado Livre sends for zpl2", async () => {
    const { request, config } = setup();
    const zip = zipArchive([
      { name: "Etiqueta de envio.txt", content: "^XA^FDPedido 55^FS^XZ", deflate: true },
    ]);
    request.mockResolvedValueOnce(new Response(zip));

    const label = await getMercadoLivreLabel(config, store, "55", "zpl");

    expect(label.file.format).toBe("zpl");
    expect(new TextDecoder().decode(label.file.bytes)).toBe("^XA^FDPedido 55^FS^XZ");
    expect(request.mock.calls[3]?.[0]).toBe(
      "https://api.mercadolibre.com/shipment_labels?shipment_ids=123&response_type=zpl2",
    );
  });
  it("joins every ZPL file of the ZIP and leaves the other files out", async () => {
    const { request, config } = setup();
    const zip = zipArchive([
      { name: "1.txt", content: "^XA^FDum^FS^XZ", deflate: true },
      { name: "leia-me.txt", content: "Instruções", deflate: false },
      { name: "2.txt", content: "^XA^FDdois^FS^XZ", deflate: false },
    ]);
    request.mockResolvedValueOnce(new Response(zip));

    const label = await getMercadoLivreLabel(config, store, "55", "zpl");

    expect(new TextDecoder().decode(label.file.bytes)).toBe("^XA^FDum^FS^XZ\n^XA^FDdois^FS^XZ");
  });
  it("takes ZPL sent as plain text too", async () => {
    const { request, config } = setup();
    request.mockResolvedValueOnce(new Response("^XA^FDPedido 55^FS^XZ"));

    const label = await getMercadoLivreLabel(config, store, "55", "zpl");

    expect(new TextDecoder().decode(label.file.bytes)).toBe("^XA^FDPedido 55^FS^XZ");
  });
  it.each([
    ["a PDF", new Response("%PDF-1.4 test")],
    ["an error page", Response.json({ message: "error" })],
    [
      "a damaged ZIP",
      new Response(zipArchive([{ name: "a.txt", content: "^XA", deflate: false }]).subarray(0, 40)),
    ],
    [
      "a ZIP without ZPL",
      new Response(zipArchive([{ name: "a.txt", content: "texto", deflate: false }])),
    ],
  ])("rejects %s answered for a ZPL label", async (_kind, answer) => {
    const { request, config } = setup();
    request.mockResolvedValueOnce(answer);

    await expect(getMercadoLivreLabel(config, store, "55", "zpl")).rejects.toMatchObject({
      code: "EXTERNAL_PROVIDER",
      message: "O marketplace não retornou uma etiqueta ZPL válida",
    });
  });
  it("prints a batch as one ZPL file", async () => {
    const { request, config } = setup();
    request.mockResolvedValueOnce(new Response("^XA^FDum^FS^XZ"));

    const batch = await getMercadoLivreLabels(config, store, ["55"], "zpl");

    expect(batch.file?.format).toBe("zpl");
    expect(request.mock.calls.at(-1)?.[0]).toBe(
      "https://api.mercadolibre.com/shipment_labels?shipment_ids=123&response_type=zpl2",
    );
  });
  it("rejects HTML or JSON masquerading as a PDF", async () => {
    const { request, config } = setup();
    request.mockResolvedValueOnce(new Response("<html>error</html>"));
    await expect(getMercadoLivreLabel(config, store, "55", "pdf")).rejects.toMatchObject({
      code: "EXTERNAL_PROVIDER",
    });
  });
});
