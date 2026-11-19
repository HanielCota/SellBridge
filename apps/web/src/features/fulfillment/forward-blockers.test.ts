import { describe, expect, it } from "vitest";
import { forwardBlockers, type ForwardItem } from "./forward-blockers";

const linked: ForwardItem = {
  title: "Camiseta básica",
  supplierId: "supplier-1",
  supplierName: "Malhas Sul",
  supplierActive: true,
};

describe("forwardBlockers", () => {
  it("finds nothing when every item has an active supplier", () => {
    expect(forwardBlockers([linked])).toEqual([]);
  });

  it("names an item no longer tied to a SellBridge product", () => {
    const blockers = forwardBlockers([
      linked,
      { title: "Boné", supplierId: null, supplierName: null, supplierActive: null },
    ]);

    expect(blockers).toEqual([
      "“Boné” não está ligado a um produto do SellBridge: o fornecedor apagou o produto ou o anúncio foi criado fora daqui.",
    ]);
  });

  it("names the deactivated supplier of an item", () => {
    const blockers = forwardBlockers([{ ...linked, supplierActive: false }]);

    expect(blockers).toEqual([
      "O fornecedor de “Camiseta básica” (Malhas Sul) foi desativado e não recebe pedidos.",
    ]);
  });

  it("asks for support when the order came without items", () => {
    expect(forwardBlockers([])).toHaveLength(1);
  });
});
