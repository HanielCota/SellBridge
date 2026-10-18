import { describe, expect, it } from "vitest";
import { catalogSearchSchema } from "./catalog.ts";

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
