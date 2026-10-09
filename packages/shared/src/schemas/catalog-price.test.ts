import { describe, expect, it } from "vitest";
import { priceForRule } from "./catalog.ts";

const product = { costCents: 3000, suggestedPriceCents: 5490 };

describe("priceForRule", () => {
  it("uses the supplier's suggested price", () => {
    expect(priceForRule(product, { kind: "suggested" })).toBe(5490);
  });

  it("adds the markup and rounds up to a price ending in ,90", () => {
    expect(priceForRule(product, { kind: "markup", percent: 40 })).toBe(4290);
    expect(
      priceForRule({ costCents: 2990, suggestedPriceCents: 0 }, { kind: "markup", percent: 50 }),
    ).toBe(4490);
  });

  it("never prices at or below cost", () => {
    expect(
      priceForRule({ costCents: 5000, suggestedPriceCents: 4000 }, { kind: "suggested" }),
    ).toBe(5100);
    expect(
      priceForRule({ costCents: 5000, suggestedPriceCents: 0 }, { kind: "markup", percent: 5 }),
    ).toBeGreaterThan(5000);
  });
});
