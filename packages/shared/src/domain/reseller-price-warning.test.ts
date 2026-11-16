import { describe, expect, it } from "vitest";
import { resellerPriceAboveSuggestedWarning } from "./reseller-price-warning.ts";

/** Intl writes a non-breaking space after "R$"; the tests read it as a plain one. */
function plainSpaces(text: string | null): string | null {
  return text === null ? null : text.replace(/\s/g, " ");
}

describe("resellerPriceAboveSuggestedWarning", () => {
  it("warns with the suggested price when the reseller would pay more than it", () => {
    const warning = resellerPriceAboveSuggestedWarning(5000, 3990);

    expect(plainSpaces(warning)).toBe(
      "Acima do preço sugerido de R$ 39,90: o revendedor teria prejuízo",
    );
  });

  it("does not warn when the reseller price is below the suggested price", () => {
    expect(resellerPriceAboveSuggestedWarning(2793, 3990)).toBeNull();
  });

  it("does not warn when the reseller price equals the suggested price", () => {
    expect(resellerPriceAboveSuggestedWarning(3990, 3990)).toBeNull();
  });

  it("does not warn without a suggested price", () => {
    expect(resellerPriceAboveSuggestedWarning(5000, null)).toBeNull();
    expect(resellerPriceAboveSuggestedWarning(5000, 0)).toBeNull();
  });

  it("does not warn without a usable reseller price", () => {
    expect(resellerPriceAboveSuggestedWarning(null, 3990)).toBeNull();
    expect(resellerPriceAboveSuggestedWarning(-100, 3990)).toBeNull();
    expect(resellerPriceAboveSuggestedWarning(Number.NaN, 3990)).toBeNull();
  });
});
