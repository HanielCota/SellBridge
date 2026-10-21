import { describe, expect, it } from "vitest";
import { storesForProducts } from "@/components/catalog/bulk-store-picker";

const stores = [
  { id: "own-store", shopName: "Own store", marketplace: "mock", supplierId: null },
  { id: "supplier-a", shopName: "First supplier", marketplace: "mock", supplierId: "a" },
  { id: "supplier-b", shopName: "Second supplier", marketplace: "mock", supplierId: "b" },
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
});
