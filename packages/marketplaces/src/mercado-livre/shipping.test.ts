import type { FetchLike } from "../http.ts";
import { describe, expect, it, vi } from "vitest";
import { getMercadoLivreLabel, getMercadoLivreShipping } from "./shipping.ts";
const store = { externalShopId: "99", accessToken: "test-token" };
const order = { seller: { id: 99 }, shipping: { id: 123 } };
const shipment = {
  id: 123,
  status: "ready_to_ship",
  substatus: "ready_to_print",
  mode: "me2",
  logistic_type: "drop_off",
  tracking_number: "ML123",
  tracking_method: "Mercado Envios",
  destination: {
    receiver_name: "Maria Silva",
    shipping_address: {
      street_name: "Rua das Flores",
      street_number: "10",
      zip_code: "01001000",
      neighborhood: { name: "Centro" },
      city: { name: "São Paulo" },
      state: { id: "BR-SP" },
    },
  },
};
function setup(overrides = {}) {
  const request = vi
    .fn<FetchLike>()
    .mockResolvedValueOnce(Response.json(order))
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
  it("fetches the authorized order, new shipment format, delivery address and tracking", async () => {
    const { request, config } = setup();
    expect(await getMercadoLivreShipping(config, store, "55")).toMatchObject({
      shipmentId: "123",
      trackingCode: "ML123",
      carrier: "Mercado Envios",
      address: { recipient: "Maria Silva", state: "SP", postalCode: "01001000" },
    });
    expect(request.mock.calls[1]?.[0]).toBe(
      "https://api.mercadolibre.com/orders/55/shipments?views=destination",
    );
    const headers = new Headers(request.mock.calls[1]?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-token");
    expect(headers.get("x-new-domain")).toBe("true");
    expect(headers.get("x-api-version")).toBe("2");
  });
  it("gets the official PDF only for printable shipments", async () => {
    const { request, config } = setup();
    request.mockResolvedValueOnce(new Response("%PDF-1.4 test"));
    const pdf = await getMercadoLivreLabel(config, store, "55");
    expect(new TextDecoder().decode(pdf)).toBe("%PDF-1.4 test");
    expect(request.mock.calls[2]?.[0]).toBe(
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
      expect(request).toHaveBeenCalledTimes(2);
    },
  );
  it("rejects an order of another seller and does not request its address", async () => {
    const { request, config } = setup();
    request
      .mockReset()
      .mockResolvedValueOnce(Response.json({ seller: { id: 100 }, shipping: { id: 123 } }));
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
