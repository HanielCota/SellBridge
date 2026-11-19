import { describe, expect, it } from "vitest";
import {
  addDraftItem,
  draftEstimatedFeeCents,
  draftFeeField,
  draftTotalCents,
  EMPTY_MANUAL_SALE,
  maskFeeInput,
  readManualSale,
  removeDraftItem,
  updateDraftItem,
  withoutErrors,
} from "./manual-sale-draft";

const PRODUCT = {
  id: "7b6f0a3e-2c1d-4e5f-9a8b-1c2d3e4f5a6b",
  title: "Sérum facial",
  supplierName: "BH Beauty",
  stock: 5,
  suggestedPriceCents: 4990,
};

function draftWithProduct() {
  return {
    ...addDraftItem(EMPTY_MANUAL_SALE, PRODUCT),
    externalOrderId: "2411SHOPEE77",
    buyerName: "Maria da Silva",
  };
}

describe("manual sale draft", () => {
  it("adds a product once, with quantity 1 and the suggested price", () => {
    const draft = addDraftItem(addDraftItem(EMPTY_MANUAL_SALE, PRODUCT), PRODUCT);

    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]).toMatchObject({ quantity: "1", price: "49,90" });
  });

  it("totals quantity times price in cents", () => {
    const draft = updateDraftItem(draftWithProduct(), PRODUCT.id, {
      quantity: "3",
      price: "10,50",
    });

    expect(draftTotalCents(draft)).toBe(3150);
  });

  it("has no total while a quantity is not a number", () => {
    const draft = updateDraftItem(draftWithProduct(), PRODUCT.id, { quantity: "2a" });

    expect(draftTotalCents(draft)).toBeNull();
  });

  it("reads a complete draft as the sale to send", () => {
    const result = readManualSale(draftWithProduct());

    expect(result.sale).toEqual({
      channel: "shopee",
      externalOrderId: "2411SHOPEE77",
      buyerName: "Maria da Silva",
      items: [{ productId: PRODUCT.id, quantity: 1, unitPriceCents: 4990 }],
      marketplaceFeeCents: 998 + 450,
    });
  });

  it("points each problem at its field", () => {
    const draft = updateDraftItem({ ...draftWithProduct(), externalOrderId: " " }, PRODUCT.id, {
      quantity: "0",
    });

    const result = readManualSale(draft);

    expect(result.errors).toEqual({
      externalOrderId: "Informe o número do pedido, como aparece no canal",
      "items.0.quantity": "A quantidade é de pelo menos 1",
    });
  });

  it("asks for a product once the last one is removed", () => {
    const draft = removeDraftItem(draftWithProduct(), PRODUCT.id);

    expect(readManualSale(draft).errors).toEqual({ items: "Adicione pelo menos um produto" });
  });

  it("drops a field's message once it changes, and every product message once the list changes", () => {
    const errors = {
      externalOrderId: "Informe o número do pedido, como aparece no canal",
      buyerName: "Informe o nome do comprador, como está na etiqueta",
      "items.0.quantity": "A quantidade é de pelo menos 1",
    };

    expect(withoutErrors(errors, ["externalOrderId", "items"])).toEqual({
      buyerName: "Informe o nome do comprador, como está na etiqueta",
    });
  });
});

describe("manual sale draft channel fee", () => {
  it("shows the Shopee estimate for the products until the reseller types a fee", () => {
    const draft = updateDraftItem(draftWithProduct(), PRODUCT.id, { quantity: "2" });

    expect(draftEstimatedFeeCents(draft)).toBe(2_896);
    expect(draftFeeField(draft)).toBe("28,96");
  });

  it("follows the channel the reseller picks while the fee is the estimate", () => {
    const draft = {
      ...updateDraftItem(draftWithProduct(), PRODUCT.id, { quantity: "2" }),
      channel: "tiktok_shop" as const,
    };

    expect(draftFeeField(draft)).toBe("23,96");
    expect(readManualSale(draft).sale?.marketplaceFeeCents).toBe(2_396);
  });

  it("keeps the fee the reseller typed when the price changes", () => {
    const typed = { ...draftWithProduct(), fee: "12,30" };

    const draft = updateDraftItem(typed, PRODUCT.id, { price: "59,90" });

    expect(draftFeeField(draft)).toBe("12,30");
    expect(readManualSale(draft).sale?.marketplaceFeeCents).toBe(1_230);
  });

  it("has no estimate while a price is not a number, and asks for the fee on sending", () => {
    const draft = updateDraftItem(draftWithProduct(), PRODUCT.id, { price: "" });

    expect(draftEstimatedFeeCents(draft)).toBeNull();
    expect(draftFeeField(draft)).toBe("");
    expect(readManualSale(draft).errors).toMatchObject({
      marketplaceFeeCents: "Informe a taxa. Se o canal não cobrou nada, digite 0",
    });
  });

  it("asks for the fee when the reseller erased it", () => {
    const result = readManualSale({ ...draftWithProduct(), fee: "" });

    expect(result.errors).toEqual({
      marketplaceFeeCents: "Informe a taxa. Se o canal não cobrou nada, digite 0",
    });
  });

  it("accepts a typed zero fee", () => {
    expect(maskFeeInput("0")).toBe("0,00");
    expect(maskFeeInput("000")).toBe("0,00");
    expect(maskFeeInput("")).toBe("");
    expect(maskFeeInput("2896")).toBe("28,96");
    expect(readManualSale({ ...draftWithProduct(), fee: "0,00" }).sale?.marketplaceFeeCents).toBe(
      0,
    );
  });
});
