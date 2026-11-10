import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../http.ts";
import { readMercadoLivreBuyerBilling, toBuyerBilling } from "./billing.ts";

const store = { externalShopId: "99", accessToken: "test-token" };

function setup(order: unknown, billing?: unknown) {
  const request = vi.fn<FetchLike>().mockResolvedValueOnce(Response.json(order));
  if (billing !== undefined) {
    request.mockResolvedValueOnce(Response.json(billing));
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

describe("readMercadoLivreBuyerBilling", () => {
  it("reads the buyer's CPF through the order's billing info id", async () => {
    const { request, config } = setup(
      { seller: { id: 99 }, buyer: { billing_info: { id: "677487519924852462" } } },
      {
        buyer: {
          billing_info: {
            name: "Maria",
            last_name: "Silva",
            identification: { type: "CPF", number: "529.982.247-25" },
          },
        },
      },
    );

    const billing = await readMercadoLivreBuyerBilling(config, store, "55");

    expect(billing).toEqual({ documentType: "CPF", document: "52998224725", name: "Maria Silva" });
    expect(request.mock.calls[1]?.[0]).toBe(
      "https://api.mercadolibre.com/orders/billing-info/MLB/677487519924852462",
    );
  });

  it("returns null when the order has no billing info", async () => {
    const { request, config } = setup({ seller: { id: 99 }, buyer: {} });

    const billing = await readMercadoLivreBuyerBilling(config, store, "55");

    expect(billing).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("refuses an order of another seller", async () => {
    const { config } = setup({ seller: { id: 1 }, buyer: {} });

    const reading = readMercadoLivreBuyerBilling(config, store, "55");

    await expect(reading).rejects.toThrow("Pedido não pertence à loja conectada");
  });
});

describe("toBuyerBilling", () => {
  it("reads a CNPJ with 14 digits", () => {
    const billing = toBuyerBilling({
      name: "Loja Exemplo Ltda",
      identification: { type: "CNPJ", number: "45.723.174/0001-10" },
    });

    expect(billing).toMatchObject({ documentType: "CNPJ", document: "45723174000110" });
  });

  it("returns null for a CPF with the wrong number of digits", () => {
    const billing = toBuyerBilling({ identification: { type: "CPF", number: "32659430" } });

    expect(billing).toBeNull();
  });

  it("returns null for a document that is not Brazilian", () => {
    const billing = toBuyerBilling({ identification: { type: "DNI", number: "30772273" } });

    expect(billing).toBeNull();
  });
});
