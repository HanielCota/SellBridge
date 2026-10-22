import { describe, expect, it } from "vitest";
import { resolveCatalogScope } from "./catalog-scope.ts";

const SUPPLIER_X = "00000000-0000-4000-8000-00000000000a";
const SUPPLIER_Y = "00000000-0000-4000-8000-00000000000b";
const STARTER = "00000000-0000-4000-8000-00000000000c";
const STORE_ONE = { id: "10000000-0000-4000-8000-000000000001", supplierId: SUPPLIER_X };
const STORE_TWO = { id: "10000000-0000-4000-8000-000000000002", supplierId: SUPPLIER_Y };

// MVP function 1: the catalog shows only the supplier of the chosen store.
describe("catalog scope", () => {
  it("shows the first store's supplier by default and the other store's when chosen", () => {
    const stores = [STORE_ONE, STORE_TWO];
    expect(resolveCatalogScope(stores, STARTER, undefined)).toEqual({
      kind: "store",
      storeId: STORE_ONE.id,
      supplierId: SUPPLIER_X,
    });
    expect(resolveCatalogScope(stores, STARTER, STORE_TWO.id)).toEqual({
      kind: "store",
      storeId: STORE_TWO.id,
      supplierId: SUPPLIER_Y,
    });
  });

  it("ignores a store id that is not one of the account's stores", () => {
    const foreign = "20000000-0000-4000-8000-000000000009";
    expect(resolveCatalogScope([STORE_ONE, STORE_TWO], STARTER, foreign)).toEqual({
      kind: "store",
      storeId: STORE_ONE.id,
      supplierId: SUPPLIER_X,
    });
  });

  it("shows the starter supplier while the account has no store", () => {
    expect(resolveCatalogScope([], STARTER, undefined)).toEqual({
      kind: "starter",
      storeId: null,
      supplierId: STARTER,
    });
  });

  it("is empty with no store and no starter supplier", () => {
    expect(resolveCatalogScope([], null, undefined)).toEqual({
      kind: "starter",
      storeId: null,
      supplierId: null,
    });
  });

  it("keeps a store without a supplier empty, never falling back to the starter supplier", () => {
    const orphan = { id: "10000000-0000-4000-8000-000000000003", supplierId: null };
    expect(resolveCatalogScope([orphan, STORE_TWO], STARTER, orphan.id)).toEqual({
      kind: "store",
      storeId: orphan.id,
      supplierId: null,
    });
  });
});
