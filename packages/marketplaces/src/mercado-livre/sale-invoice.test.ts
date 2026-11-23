import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../http.ts";
import { readMercadoLivreSaleInvoice, sendMercadoLivreSaleInvoice } from "./sale-invoice.ts";

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
      "Este pedido é de outra conta do Mercado Livre, não desta loja.",
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

const XML = '<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00"></nfeProc>';
const NO_NOTE = () => Response.json({ message: "not found" }, { status: 404 });

describe("sendMercadoLivreSaleInvoice", () => {
  it("posts the note's XML to the order's shipment", async () => {
    const { request, config } = setup(
      Response.json(ORDER),
      NO_NOTE(),
      Response.json({ id: 1 }, { status: 201 }),
    );

    await sendMercadoLivreSaleInvoice(config, store, {
      orderId: "2000123",
      accessKey: KEY,
      xml: XML,
    });

    const [url, init] = request.mock.calls[2] ?? [];
    expect(String(url)).toBe(
      "https://api.mercadolibre.com/shipments/53932058390/invoice_data?siteId=MLB",
    );
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/xml");
    expect(init?.body).toBe(XML);
  });

  it("sends nothing when the shipment already carries this note", async () => {
    const { request, config } = setup(Response.json(ORDER), Response.json({ fiscal_key: KEY }));

    await sendMercadoLivreSaleInvoice(config, store, {
      orderId: "2000123",
      accessKey: KEY,
      xml: XML,
    });

    expect(request).toHaveBeenCalledTimes(2);
  });

  it("says in the reseller's words why Mercado Livre refused the note", async () => {
    const { config } = setup(
      Response.json(ORDER),
      NO_NOTE(),
      Response.json({ error: "invalid_sender_cnpj", message: "x" }, { status: 400 }),
    );

    const sent = sendMercadoLivreSaleInvoice(config, store, {
      orderId: "2000123",
      accessKey: KEY,
      xml: XML,
    });

    await expect(sent).rejects.toThrow(/mesmo CNPJ/);
  });

  it("gives up on a send Mercado Livre never answers, instead of waiting forever", async () => {
    const { request, config } = setup(Response.json(ORDER), NO_NOTE());
    request.mockImplementationOnce(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    const sent = sendMercadoLivreSaleInvoice(
      { ...config, retry: { retries: 0, timeoutMilliseconds: 50 } },
      store,
      { orderId: "2000123", accessKey: KEY, xml: XML },
    );

    await expect(sent).rejects.toThrow("Falha de rede ao falar com o marketplace");
  });

  it("asks to reconnect the store when Mercado Livre refuses its token", async () => {
    const { config } = setup(
      Response.json(ORDER),
      NO_NOTE(),
      Response.json({ message: "invalid access token" }, { status: 401 }),
    );

    const sent = sendMercadoLivreSaleInvoice(config, store, {
      orderId: "2000123",
      accessKey: KEY,
      xml: XML,
    });

    await expect(sent).rejects.toMatchObject({ code: "EXTERNAL_PROVIDER_AUTH" });
  });

  it("refuses an order that has no shipment yet", async () => {
    const { config } = setup(Response.json({ seller: { id: 99 }, shipping: null }));

    const sent = sendMercadoLivreSaleInvoice(config, store, {
      orderId: "2000123",
      accessKey: KEY,
      xml: XML,
    });

    await expect(sent).rejects.toThrow("O pedido ainda não tem envio no Mercado Livre");
  });
});
