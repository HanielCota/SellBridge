import { describe, expect, it } from "vitest";
import { storesForProducts } from "@/components/catalog/bulk-store-picker";

const stores = [
  { id: "own-store", shopName: "Own store", marketplace: "mock", supplierIds: [] },
  { id: "supplier-a", shopName: "First supplier", marketplace: "mock", supplierIds: ["a"] },
  { id: "supplier-b", shopName: "Second supplier", marketplace: "mock", supplierIds: ["b"] },
];
const own = { supplierId: "private-source", catalogKind: "seller" as const };

describe("publication store eligibility", () => {
  it("offers every store for own products", () => {
    expect(storesForProducts([own], stores)).toEqual(stores);
  });
  it("accepts own products with a single external supplier in its store", () => {
    expect(storesForProducts([own, { supplierId: "a" }], stores).map((store) => store.id)).toEqual([
      "supplier-a",
    ]);
  });
  it("keeps the external supplier rule even when own products are included", () => {
    expect(storesForProducts([own, { supplierId: "a" }, { supplierId: "b" }], stores)).toEqual([]);
    expect(storesForProducts([], stores)).toEqual([]);
  });
  it("offers a store that sells every supplier of the chosen products", () => {
    const both = { id: "both", shopName: "Both", marketplace: "mock", supplierIds: ["b", "a"] };

    const offered = storesForProducts(
      [{ supplierId: "a" }, { supplierId: "b" }],
      [...stores, both],
    );

    expect(offered.map((store) => store.id)).toEqual(["both"]);
  });
});
