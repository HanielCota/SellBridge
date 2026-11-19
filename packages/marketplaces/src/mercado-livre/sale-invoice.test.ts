import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../http.ts";
import { readMercadoLivreSaleInvoice } from "./sale-invoice.ts";

const store = { externalShopId: "99", accessToken: "test-token" };
const KEY = "35261111222333000181550010000048211123456789";

function setup(...answers: Response[]) {
  const request = vi.fn<FetchLike>();
  for (const answer of answers) {
    request.mockResolvedValueOnce(answer);
  }
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

const ORDER = { seller: { id: 99 }, shipping: { id: 53932058390 } };

describe("readMercadoLivreSaleInvoice", () => {
  it("reads the key and issue date of the note sent for the order's shipment", async () => {
    const { request, config } = setup(
      Response.json(ORDER),
      Response.json({
        fiscal_key: KEY,
        invoice_serie: "1",
        invoice_number: "4821",
        status: "approved",
        invoice_date: "2026-11-19T10:04:21.000-03:00",
      }),
    );

    const invoice = await readMercadoLivreSaleInvoice(config, store, "55");

    expect(invoice).toEqual({ accessKey: KEY, issuedAt: new Date("2026-11-19T13:04:21.000Z") });
    expect(request.mock.calls[1]?.[0]).toBe(
      "https://api.mercadolibre.com/shipments/53932058390/invoice_data?siteId=MLB",
    );
  });

  it("returns null while the shipment has no note (404)", async () => {
    const { config } = setup(
      Response.json(ORDER),
      Response.json({ message: "not found", error: "not_found" }, { status: 404 }),
    );

    expect(await readMercadoLivreSaleInvoice(config, store, "55")).toBeNull();
  });

  it("returns null without asking for a note when the order has no shipment", async () => {
    const { request, config } = setup(Response.json({ seller: { id: 99 } }));

    expect(await readMercadoLivreSaleInvoice(config, store, "55")).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps the date unknown when Mercado Livre sends one it cannot read", async () => {
    const { config } = setup(
      Response.json(ORDER),
      Response.json({ fiscal_key: KEY, invoice_date: "ontem" }),
    );

    expect((await readMercadoLivreSaleInvoice(config, store, "55"))?.issuedAt).toBeNull();
  });

  it("refuses an order of another seller", async () => {
    const { config } = setup(Response.json({ ...ORDER, seller: { id: 7 } }));

    await expect(readMercadoLivreSaleInvoice(config, store, "55")).rejects.toThrow(
      "Pedido não pertence à loja conectada",
    );
  });

  it("passes on a failure that is not a missing note", async () => {
    const { config } = setup(
      Response.json(ORDER),
      Response.json({ message: "busy", error: "too_many_requests" }, { status: 429 }),
    );

    await expect(readMercadoLivreSaleInvoice(config, store, "55")).rejects.toMatchObject({
      details: { retryable: true },
    });
  });
});
