import { describe, expect, it } from "vitest";
import {
  catalogSearchSchema,
  SELLABLE_PRODUCT_SORT_LABELS,
  SELLABLE_PRODUCT_SORTS,
  sellableCatalogSearchSchema,
} from "./catalog.ts";

describe("catalogSearchSchema", () => {
  it("ignores a blank cost bound in the URL", () => {
    const search = catalogSearchSchema.parse({ minCost: " ", maxCost: "" });
    expect(search.minCost).toBeUndefined();
    expect(search.maxCost).toBeUndefined();
  });

  it("ignores a null cost bound", () => {
    expect(catalogSearchSchema.parse({ maxCost: null }).maxCost).toBeUndefined();
  });

  it("keeps a typed cost bound, zero included", () => {
    expect(catalogSearchSchema.parse({ minCost: "0", maxCost: 5000 })).toMatchObject({
      minCost: 0,
      maxCost: 5000,
    });
  });

  it("reads inStock=false as the filter off", () => {
    expect(catalogSearchSchema.parse({ inStock: "false" }).inStock).toBe(false);
    expect(catalogSearchSchema.parse({ inStock: "true" }).inStock).toBe(true);
    expect(catalogSearchSchema.parse({ inStock: true }).inStock).toBe(true);
  });
});

describe("sellableCatalogSearchSchema sort", () => {
  it("shows the best sellers first when the URL has no sort", () => {
    expect(sellableCatalogSearchSchema.parse({}).sort).toBe("best_sellers");
  });

  it("falls back to the best sellers on an unknown sort", () => {
    expect(sellableCatalogSearchSchema.parse({ sort: "random" }).sort).toBe("best_sellers");
  });

  it("keeps the other sorts the reseller picks", () => {
    expect(sellableCatalogSearchSchema.parse({ sort: "title" }).sort).toBe("title");
    expect(sellableCatalogSearchSchema.parse({ sort: "margin_desc" }).sort).toBe("margin_desc");
  });

  it('offers "Mais vendidos" first in the sort menu', () => {
    expect(SELLABLE_PRODUCT_SORTS[0]).toBe("best_sellers");
    expect(SELLABLE_PRODUCT_SORT_LABELS.best_sellers).toBe("Mais vendidos");
  });

  it("keeps the best sellers sort off the supplier page, which has no sales ranking", () => {
    expect(catalogSearchSchema.parse({ sort: "best_sellers" }).sort).toBe("title");
  });
});
