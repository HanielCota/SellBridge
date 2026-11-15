import { describe, expect, it } from "vitest";
import { resolveCatalogScope, resolveSupplierFilter } from "./catalog-scope.ts";

const SUPPLIER_X = "00000000-0000-4000-8000-00000000000a";
const SUPPLIER_Y = "00000000-0000-4000-8000-00000000000b";
const STARTER = "00000000-0000-4000-8000-00000000000c";
const STORE_ONE = { id: "10000000-0000-4000-8000-000000000001", supplierIds: [SUPPLIER_X] };
const STORE_TWO = { id: "10000000-0000-4000-8000-000000000002", supplierIds: [SUPPLIER_Y] };

// MVP function 1: the catalog shows only the suppliers of the chosen store.
describe("catalog scope", () => {
  it("shows the first store's suppliers by default and the other store's when chosen", () => {
    const stores = [STORE_ONE, STORE_TWO];
    expect(resolveCatalogScope(stores, STARTER, undefined)).toEqual({
      kind: "store",
      storeId: STORE_ONE.id,
      supplierIds: [SUPPLIER_X],
    });
    expect(resolveCatalogScope(stores, STARTER, STORE_TWO.id)).toEqual({
      kind: "store",
      storeId: STORE_TWO.id,
      supplierIds: [SUPPLIER_Y],
    });
  });

  it("ignores a store id that is not one of the account's stores", () => {
    const foreign = "20000000-0000-4000-8000-000000000009";
    expect(resolveCatalogScope([STORE_ONE, STORE_TWO], STARTER, foreign)).toEqual({
      kind: "store",
      storeId: STORE_ONE.id,
      supplierIds: [SUPPLIER_X],
    });
  });

  it("shows the starter supplier while the account has no store", () => {
    expect(resolveCatalogScope([], STARTER, undefined)).toEqual({
      kind: "starter",
      storeId: null,
      supplierIds: [STARTER],
    });
  });

  it("is empty with no store and no starter supplier", () => {
    expect(resolveCatalogScope([], null, undefined)).toEqual({
      kind: "starter",
      storeId: null,
      supplierIds: [],
    });
  });

  it("keeps a store without a supplier empty, never falling back to the starter supplier", () => {
    const orphan = { id: "10000000-0000-4000-8000-000000000003", supplierIds: [] };
    expect(resolveCatalogScope([orphan, STORE_TWO], STARTER, orphan.id)).toEqual({
      kind: "store",
      storeId: orphan.id,
      supplierIds: [],
    });
  });

  it("keeps every supplier of a store that sells several", () => {
    const shared = {
      id: "10000000-0000-4000-8000-000000000004",
      supplierIds: [SUPPLIER_X, SUPPLIER_Y],
    };
    expect(resolveCatalogScope([shared], STARTER, undefined)).toEqual({
      kind: "store",
      storeId: shared.id,
      supplierIds: [SUPPLIER_X, SUPPLIER_Y],
    });
  });
});

describe("supplier filter", () => {
  it("keeps a supplier the chosen store sells", () => {
    expect(resolveSupplierFilter([SUPPLIER_X, SUPPLIER_Y], SUPPLIER_Y)).toBe(SUPPLIER_Y);
  });

  it("ignores a supplier the chosen store does not sell", () => {
    expect(resolveSupplierFilter([SUPPLIER_X], SUPPLIER_Y)).toBeNull();
  });

  it("shows every supplier when no filter is asked for", () => {
    expect(resolveSupplierFilter([SUPPLIER_X, SUPPLIER_Y], undefined)).toBeNull();
  });
});
