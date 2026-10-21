import { describe, expect, it } from "vitest";
import { normalizeCostRange } from "./cost-range";

describe("normalizeCostRange", () => {
  it("keeps a range inside the catalog as typed", () => {
    expect(normalizeCostRange({ minCost: 0, maxCost: 100_000_000 })).toEqual({
      minCost: 0,
      maxCost: 100_000_000,
    });
  });

  it("brings a bound above the ceiling down to it", () => {
    expect(normalizeCostRange({ minCost: undefined, maxCost: 100_000_001 })).toEqual({
      minCost: undefined,
      maxCost: 100_000_000,
    });
  });

  it("puts swapped bounds back in order", () => {
    expect(normalizeCostRange({ minCost: 5000, maxCost: 1000 })).toEqual({
      minCost: 1000,
      maxCost: 5000,
    });
  });

  it("leaves open bounds open", () => {
    expect(normalizeCostRange({ minCost: undefined, maxCost: undefined })).toEqual({
      minCost: undefined,
      maxCost: undefined,
    });
  });
});
