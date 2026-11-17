import { describe, expect, it } from "vitest";
import { labelSharingRefusal } from "./label-sharing";

describe("labelSharingRefusal", () => {
  it("allows the label of an order one supplier ships alone", () => {
    expect(labelSharingRefusal({ parcelCount: 1, supplierIds: ["a"] })).toBeNull();
  });

  it("allows the label of a cart whose orders all go to the same supplier", () => {
    expect(labelSharingRefusal({ parcelCount: 1, supplierIds: ["a", "a"] })).toBeNull();
  });

  it("refuses the label of an order split between suppliers", () => {
    expect(labelSharingRefusal({ parcelCount: 2, supplierIds: ["a", "b"] })).toMatch(
      /^Este pedido foi dividido entre fornecedores/,
    );
  });

  it("refuses the label of an order whose cart has another supplier's products", () => {
    expect(labelSharingRefusal({ parcelCount: 1, supplierIds: ["a", "b"] })).toMatch(
      /carrinho do Mercado Livre junto com produtos de outro fornecedor/,
    );
  });
});
