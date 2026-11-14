import { describe, expect, test } from "vitest";
import { InvalidUnitsSoldError, PRODUCT_HEAT_THRESHOLDS, productHeatLevel } from "./product-heat";

describe("productHeatLevel", () => {
  test("reads no sales as none", () => {
    expect(productHeatLevel(0)).toBe("none");
  });

  test("reads one sale as cold", () => {
    expect(productHeatLevel(1)).toBe("cold");
  });

  test("stays cold right below the warm threshold", () => {
    expect(productHeatLevel(PRODUCT_HEAT_THRESHOLDS.warmFromUnits - 1)).toBe("cold");
  });

  test("turns warm at the warm threshold", () => {
    expect(productHeatLevel(PRODUCT_HEAT_THRESHOLDS.warmFromUnits)).toBe("warm");
  });

  test("stays warm right below the hot threshold", () => {
    expect(productHeatLevel(PRODUCT_HEAT_THRESHOLDS.hotFromUnits - 1)).toBe("warm");
  });

  test("turns hot at the hot threshold", () => {
    expect(productHeatLevel(PRODUCT_HEAT_THRESHOLDS.hotFromUnits)).toBe("hot");
  });

  test("keeps very large counts hot", () => {
    expect(productHeatLevel(1_000_000)).toBe("hot");
  });

  test("throws InvalidUnitsSoldError for a negative count", () => {
    expect(() => productHeatLevel(-1)).toThrow(InvalidUnitsSoldError);
  });

  test("throws InvalidUnitsSoldError for NaN", () => {
    expect(() => productHeatLevel(Number.NaN)).toThrow(InvalidUnitsSoldError);
  });

  test("throws InvalidUnitsSoldError for infinity", () => {
    expect(() => productHeatLevel(Number.POSITIVE_INFINITY)).toThrow(InvalidUnitsSoldError);
  });

  test("throws InvalidUnitsSoldError for a fractional count", () => {
    expect(() => productHeatLevel(2.5)).toThrow(InvalidUnitsSoldError);
  });
});
