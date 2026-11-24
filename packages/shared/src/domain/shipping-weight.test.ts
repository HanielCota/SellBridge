import { describe, expect, it } from "vitest";
import { readPackageMeasure, shippingWeightGrams } from "./shipping-weight.ts";

const PACKAGE_WEIGHT_CASES: readonly (readonly [string, number | null])[] = [
  ["500", 500],
  ["850 g", 850],
  ["850G", 850],
  [" 1300 ", 1300],
  ["450,2", 451],
  ["0.4", 1],
  ["0", null],
  ["", null],
  ["0,5 kg", null],
  ["-3", null],
  ["meio quilo", null],
  ["12x20", null],
  ["999999999", 999_999_999],
  ["1000000000", null],
  ["99999999999", null],
];

describe("readPackageMeasure", () => {
  it.each(PACKAGE_WEIGHT_CASES)("reads the weight %j as %j grams", (stored, grams) => {
    const measure = readPackageMeasure(stored, "g");

    expect(measure).toBe(grams);
  });

  it("refuses a weight typed in centimeters", () => {
    const measure = readPackageMeasure("12 cm", "g");

    expect(measure).toBeNull();
  });
});

describe("shippingWeightGrams", () => {
  it("prices shipping on the packed weight when the supplier gave it", () => {
    const grams = shippingWeightGrams({
      mercadoLivreAttributes: { SELLER_PACKAGE_WEIGHT: "1300 g" },
      netWeightGrams: 900,
    });

    expect(grams).toBe(1300);
  });

  it("falls back to the product's own weight without a packed weight", () => {
    const grams = shippingWeightGrams({ mercadoLivreAttributes: {}, netWeightGrams: 900 });

    expect(grams).toBe(900);
  });

  it("falls back to the product's own weight when the packed weight is unreadable", () => {
    const grams = shippingWeightGrams({
      mercadoLivreAttributes: { SELLER_PACKAGE_WEIGHT: "0,5 kg" },
      netWeightGrams: 450,
    });

    expect(grams).toBe(450);
  });

  it("is unknown when the supplier gave no weight at all", () => {
    const grams = shippingWeightGrams({ mercadoLivreAttributes: {}, netWeightGrams: null });

    expect(grams).toBeNull();
  });

  it("is unknown for a zero product weight", () => {
    const grams = shippingWeightGrams({ mercadoLivreAttributes: {}, netWeightGrams: 0 });

    expect(grams).toBeNull();
  });
});
