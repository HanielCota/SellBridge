import { describe, expect, it } from "vitest";
import {
  catalogDescription,
  NO_SUPPLIER_TEXTS,
  pausedTitle,
  storeOptionLabel,
} from "./catalog-store-scope";

const STORE = "10000000-0000-4000-8000-000000000001";

// MVP function 1: the catalog title says whose products these are, and for which store.
describe("catalog description", () => {
  it("names the supplier and the store", () => {
    expect(
      catalogDescription(
        { kind: "store", storeId: STORE, supplierIds: ["x"] },
        ["BH Beauty Distribuidora"],
        "Ana Moda",
      ),
    ).toBe(
      "Produtos de BH Beauty Distribuidora para a loja Ana Moda. Marque vários para publicar de uma vez.",
    );
  });

  it("names the starter supplier while there is no store", () => {
    expect(
      catalogDescription(
        { kind: "starter", storeId: null, supplierIds: ["x"] },
        ["Rio Pet Atacado"],
        null,
      ),
    ).toBe(
      "Produtos de Rio Pet Atacado, o fornecedor que você escolheu. Marque vários para publicar de uma vez.",
    );
  });

  it("names every supplier of a store that sells several", () => {
    expect(
      catalogDescription(
        { kind: "store", storeId: STORE, supplierIds: ["x", "y"] },
        ["BH Beauty Distribuidora", "Rio Pet Atacado"],
        "Ana Moda",
      ),
    ).toBe(
      "Produtos de BH Beauty Distribuidora e Rio Pet Atacado para a loja Ana Moda. Marque vários para publicar de uma vez.",
    );
  });

  it("explains where the products come from when there is no supplier to show", () => {
    expect(
      catalogDescription({ kind: "store", storeId: STORE, supplierIds: [] }, [], "Ana Moda"),
    ).toBe("Cada loja vende os produtos dos fornecedores escolhidos para ela.");
  });
});

describe("paused title", () => {
  it("says one supplier is paused", () => {
    expect(pausedTitle(["Rio Pet Atacado"])).toBe("Rio Pet Atacado está pausado");
  });

  it("says several suppliers are paused", () => {
    expect(pausedTitle(["Rio Pet Atacado", "BH Beauty"])).toBe(
      "Rio Pet Atacado e BH Beauty estão pausados",
    );
  });
});

// Review finding (function 1): two stores with similar names on different marketplaces looked
// the same, and a store without a supplier only showed it once picked.
describe("store option label", () => {
  it("names the store and its marketplace", () => {
    expect(
      storeOptionLabel({
        shopName: "Ana Moda",
        marketplaceLabel: "Mercado Livre",
        hasSupplier: true,
      }),
    ).toEqual({ name: "Ana Moda · Mercado Livre", note: null });
  });

  it("says when the store has no supplier yet", () => {
    expect(
      storeOptionLabel({ shopName: "Ana Moda", marketplaceLabel: "Shopee", hasSupplier: false }),
    ).toEqual({ name: "Ana Moda · Shopee", note: "sem fornecedor" });
  });
});

// Review finding (function 1): the empty states used an arrow as a menu path and repeated the
// button right below; they now say where to go in plain words.
describe("empty state texts", () => {
  it("never uses an arrow as a menu path", () => {
    for (const text of Object.values(NO_SUPPLIER_TEXTS)) {
      expect(text).not.toContain("→");
    }
  });
});
