import { describe, expect, it } from "vitest";
import { trendTagParts } from "@/features/reports/trend-tone";
import { supplierTrendPolarity } from "./amount-labels";

describe("supplierTrendPolarity", () => {
  it("paints more sales green", () => {
    expect(trendTagParts(12, 10, supplierTrendPolarity("sold"))?.tone).toBe("good");
  });

  it("paints more cancelled or returned orders red", () => {
    expect(trendTagParts(12, 10, supplierTrendPolarity("lost"))?.tone).toBe("bad");
  });

  it("paints fewer cancelled or returned orders green", () => {
    expect(trendTagParts(8, 10, supplierTrendPolarity("lost"))?.tone).toBe("good");
  });

  it.each(["open", "delivered"] as const)(
    "treats %s orders as sales, where more is good",
    (situation) => {
      expect(supplierTrendPolarity(situation)).toBe("higher-is-better");
    },
  );
});
