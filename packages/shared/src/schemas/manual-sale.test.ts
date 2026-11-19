import { describe, expect, it } from "vitest";
import { estimatedManualSaleFeeCents, manualSaleSchema } from "./manual-sale.ts";

const PRODUCT_ID = "7b6f0a3e-2c1d-4e5f-9a8b-1c2d3e4f5a6b";

function sale(overrides: Record<string, unknown> = {}) {
  return {
    channel: "shopee",
    externalOrderId: " 2411SHOPEE77 ",
    buyerName: " Maria da Silva ",
    items: [{ productId: PRODUCT_ID, quantity: 2, unitPriceCents: 4990 }],
    marketplaceFeeCents: 2896,
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

  it("refuses a sale whose total does not fit a stored amount, on the products list", () => {
    const items = [{ productId: PRODUCT_ID, quantity: 999, unitPriceCents: 2_150_000 }];

    const result = manualSaleSchema.safeParse(sale({ items }));

    expect(result.error?.issues).toMatchObject([
      {
        path: ["items"],
        message: expect.stringMatching(/^O total da venda passa de R\$\s21\.474\.836,47\. Confira/),
      },
    ]);
  });

  it("accepts a sale whose total is exactly the largest stored amount", () => {
    const items = [{ productId: PRODUCT_ID, quantity: 1, unitPriceCents: 7_483_647 }].concat(
      Array.from({ length: 2 }, () => ({
        productId: PRODUCT_ID,
        quantity: 107,
        unitPriceCents: 10_000_000,
      })),
    );

    expect(manualSaleSchema.safeParse(sale({ items })).success).toBe(true);
  });

  it("refuses a channel that has its own integration", () => {
    const result = manualSaleSchema.safeParse(sale({ channel: "mercado_livre" }));

    expect(result.success).toBe(false);
  });
});

describe("manualSaleSchema channel fee", () => {
  it("accepts a sale the channel charged nothing", () => {
    const parsed = manualSaleSchema.parse(sale({ marketplaceFeeCents: 0 }));

    expect(parsed.marketplaceFeeCents).toBe(0);
  });

  it("asks for the fee when it is missing, saying how to type none", () => {
    const result = manualSaleSchema.safeParse(sale({ marketplaceFeeCents: Number.NaN }));

    expect(result.error?.issues).toMatchObject([
      {
        path: ["marketplaceFeeCents"],
        message: "Informe a taxa. Se o canal não cobrou nada, digite 0",
      },
    ]);
  });

  it("refuses a negative fee", () => {
    const result = manualSaleSchema.safeParse(sale({ marketplaceFeeCents: -1 }));

    expect(result.error?.issues[0]?.message).toBe("A taxa não pode ser negativa");
  });

  it("refuses a fee above the sale total, naming the total", () => {
    const result = manualSaleSchema.safeParse(sale({ marketplaceFeeCents: 9_981 }));

    expect(result.error?.issues).toMatchObject([
      {
        path: ["marketplaceFeeCents"],
        message: expect.stringMatching(/^A taxa não pode passar do total da venda \(R\$\s99,80\)$/),
      },
    ]);
  });

  it("accepts a fee equal to the sale total", () => {
    expect(manualSaleSchema.safeParse(sale({ marketplaceFeeCents: 9_980 })).success).toBe(true);
  });
});

describe("estimatedManualSaleFeeCents", () => {
  it("charges two Shopee units at R$ 49,90 their 20% plus R$ 4,50 each", () => {
    const items = [{ quantity: 2, unitPriceCents: 4_990 }];

    expect(estimatedManualSaleFeeCents("shopee", items)).toBe(2 * (998 + 450));
  });

  it("charges two TikTok Shop units at R$ 49,90 the commission, fixed fee and shipping program", () => {
    const items = [{ quantity: 2, unitPriceCents: 4_990 }];

    expect(estimatedManualSaleFeeCents("tiktok_shop", items)).toBe(2 * (499 + 400 + 299));
  });

  it("prices each product on its own Shopee band and adds them up", () => {
    const items = [
      { quantity: 1, unitPriceCents: 800 },
      { quantity: 3, unitPriceCents: 15_000 },
    ];

    expect(estimatedManualSaleFeeCents("shopee", items)).toBe(160 + 400 + 3 * (2_100 + 2_000));
  });

  it("charges nothing for a sale without products", () => {
    expect(estimatedManualSaleFeeCents("tiktok_shop", [])).toBe(0);
  });
});
