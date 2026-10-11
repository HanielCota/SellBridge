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

  it("does not jump a whole real when the markup lands exactly on a ,90 price", () => {
    expect(
      priceForRule({ costCents: 200, suggestedPriceCents: 0 }, { kind: "markup", percent: 145 }),
    ).toBe(490);
    expect(
      priceForRule({ costCents: 450, suggestedPriceCents: 0 }, { kind: "markup", percent: 120 }),
    ).toBe(990);
  });

  it("matches exact integer arithmetic for every markup", () => {
    const mismatches: string[] = [];
    for (let costCents = 1; costCents <= 20_000; costCents += 1) {
      for (let percent = 5; percent <= 300; percent += 5) {
        const scaled = costCents * (100 + percent);
        // Smallest price ending in ,90 that is >= cost × (1 + percent/100), in integers only.
        const exact = Math.max(Math.ceil((scaled + 1_000) / 10_000) * 100 - 10, costCents + 100);
        const actual = priceForRule(
          { costCents, suggestedPriceCents: 0 },
          { kind: "markup", percent },
        );
        if (actual !== exact) {
          mismatches.push(`${costCents}+${percent}%: ${actual} != ${exact}`);
        }
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
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
