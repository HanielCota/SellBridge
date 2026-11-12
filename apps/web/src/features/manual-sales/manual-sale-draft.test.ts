import { describe, expect, it } from "vitest";
import {
  addDraftItem,
  draftTotalCents,
  EMPTY_MANUAL_SALE,
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
