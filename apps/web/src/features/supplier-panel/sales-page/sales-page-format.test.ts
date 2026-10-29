import { describe, expect, it } from "vitest";
import { chartBucketOf, marketplaceShares, periodDays } from "./sales-page-format";

describe("chartBucketOf", () => {
  it("draws one bar a day up to two months and one a week past that", () => {
    expect(periodDays({ fromDate: "2026-10-01", toDate: "2026-10-31" })).toBe(31);
    expect(chartBucketOf({ fromDate: "2026-10-01", toDate: "2026-10-31" })).toBe("day");
    expect(chartBucketOf({ fromDate: "2026-08-01", toDate: "2026-10-01" })).toBe("day");
    expect(chartBucketOf({ fromDate: "2026-06-01", toDate: "2026-10-27" })).toBe("week");
  });
});

describe("marketplaceShares", () => {
  it("rounds the shares so they always add up to 100", () => {
    const shares = marketplaceShares([
      { marketplace: "mercado_livre", orders: 2, receivableCents: 100 },
      { marketplace: "shopee", orders: 1, receivableCents: 50 },
    ]);
    expect(shares.map((share) => share.percent)).toEqual([67, 33]);
  });

  it("keeps every share at zero without orders", () => {
    expect(
      marketplaceShares([{ marketplace: "shopee", orders: 0, receivableCents: 0 }])[0]?.percent,
    ).toBe(0);
  });
});
