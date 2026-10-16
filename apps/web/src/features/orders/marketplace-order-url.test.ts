import { describe, expect, it } from "vitest";
import { marketplaceOrderUrl } from "./marketplace-order-url";

describe("marketplaceOrderUrl", () => {
  it("links a Mercado Livre sale to its page in the seller's sales", () => {
    expect(marketplaceOrderUrl("mercado_livre", "2000003508897196")).toBe(
      "https://www.mercadolivre.com.br/vendas/2000003508897196/detalhe",
    );
  });

  it("has nothing to open for a simulated store", () => {
    expect(marketplaceOrderUrl("mock", "MOCK-1")).toBeNull();
  });

  it("never builds a link from an order number that is not one", () => {
    expect(marketplaceOrderUrl("mercado_livre", "../../conta")).toBeNull();
  });
});
