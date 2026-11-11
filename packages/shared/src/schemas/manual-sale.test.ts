import { describe, expect, it } from "vitest";
import { manualSaleSchema } from "./manual-sale.ts";

const PRODUCT_ID = "7b6f0a3e-2c1d-4e5f-9a8b-1c2d3e4f5a6b";

function sale(overrides: Record<string, unknown> = {}) {
  return {
    channel: "shopee",
    externalOrderId: " 2411SHOPEE77 ",
    buyerName: " Maria da Silva ",
    items: [{ productId: PRODUCT_ID, quantity: 2, unitPriceCents: 4990 }],
    ...overrides,
  };
}

describe("manualSaleSchema", () => {
  it("accepts a Shopee sale and trims the typed text", () => {
    const parsed = manualSaleSchema.parse(sale());

    expect(parsed).toMatchObject({ externalOrderId: "2411SHOPEE77", buyerName: "Maria da Silva" });
  });

  it("refuses a sale without products", () => {
    const result = manualSaleSchema.safeParse(sale({ items: [] }));

    expect(result.error?.issues[0]?.message).toBe("Adicione pelo menos um produto");
  });

  it("refuses a blank order number", () => {
    const result = manualSaleSchema.safeParse(sale({ externalOrderId: "   " }));

    expect(result.error?.issues[0]?.message).toBe(
      "Informe o número do pedido, como aparece no canal",
    );
  });

  it("refuses a zero quantity and a price in fractions of a cent", () => {
    const result = manualSaleSchema.safeParse(
      sale({ items: [{ productId: PRODUCT_ID, quantity: 0, unitPriceCents: 49.5 }] }),
    );

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "A quantidade é de pelo menos 1",
      "Informe o preço em reais e centavos",
    ]);
  });

  it("refuses a channel that has its own integration", () => {
    const result = manualSaleSchema.safeParse(sale({ channel: "mercado_livre" }));

    expect(result.success).toBe(false);
  });
});
