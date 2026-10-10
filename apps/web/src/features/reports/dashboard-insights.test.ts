import { describe, expect, it } from "vitest";
import {
  bestPoint,
  explainRevenue,
  roundToTotal,
  buildMoneyFlow,
  marginOf,
  previousAverage,
  trendOf,
} from "./dashboard-insights";

const summary = {
  orders: 10,
  revenueCents: 100_000,
  costCents: 50_000,
  feeCents: 12_000,
  refundCents: 3_000,
  commissionCents: 1_000,
  platformFeeCents: 2_000,
  profitCents: 34_000,
};

describe("buildMoneyFlow", () => {
  it("splits revenue into cost, fees (marketplace + platform), refunds and profit", () => {
    const flow = buildMoneyFlow(summary);
    expect(flow?.parts.map((part) => [part.key, part.cents])).toEqual([
      ["cost", 50_000],
      ["fees", 14_000],
      ["refunds", 3_000],
      ["profit", 34_000],
    ]);
    const shares = flow?.parts.reduce((sum, part) => sum + part.share, 0) ?? 0;
    expect(shares).toBeCloseTo(1);
    expect(flow?.commissionCents).toBe(1_000);
  });

  it("rounds the R$ 100 split so it always adds up to 100", () => {
    const flow = buildMoneyFlow({
      ...summary,
      costCents: 48_600,
      feeCents: 12_600,
      platformFeeCents: 2_000,
      refundCents: 900,
      profitCents: 35_900,
    });
    const total = flow?.parts.reduce((sum, part) => sum + part.perHundred, 0);
    expect(total).toBe(100);
  });

  it("leaves out empty slices", () => {
    const flow = buildMoneyFlow({ ...summary, refundCents: 0, profitCents: 37_000 });
    expect(flow?.parts.map((part) => part.key)).toEqual(["cost", "fees", "profit"]);
  });

  it("has nothing to show without revenue or with a loss", () => {
    expect(buildMoneyFlow({ ...summary, revenueCents: 0 })).toBeNull();
    expect(buildMoneyFlow({ ...summary, profitCents: -500 })).toBeNull();
  });
});

describe("bestPoint", () => {
  it("finds the highest positive bucket", () => {
    const points = [
      { date: "2026-09-01", value: 10 },
      { date: "2026-09-02", value: 40 },
      { date: "2026-09-03", value: null },
    ];
    expect(bestPoint(points, (point) => point.value)).toEqual({ date: "2026-09-02", value: 40 });
  });

  it("returns null when nothing sold", () => {
    expect(bestPoint([{ date: "2026-09-01", value: 0 }], (point) => point.value)).toBeNull();
  });
});

describe("trends and averages", () => {
  it("reports direction and size of the change", () => {
    expect(trendOf(120, 100)).toEqual({ direction: "up", percent: 20, isOffScale: false });
    expect(trendOf(80, 100)).toEqual({ direction: "down", percent: 20, isOffScale: false });
    expect(trendOf(100, 100)).toEqual({ direction: "flat", percent: 0, isOffScale: false });
    expect(trendOf(13_288, 100)?.isOffScale).toBe(true);
    expect(trendOf(100, 0)).toBeNull();
    expect(trendOf(null, 100)).toBeNull();
  });

  it("spreads the previous total over the same buckets", () => {
    expect(previousAverage(3000, 30)).toBe(100);
    expect(previousAverage(null, 30)).toBeNull();
    expect(previousAverage(3000, 0)).toBeNull();
  });

  it("computes margin only with revenue", () => {
    expect(marginOf({ profitCents: 36, revenueCents: 100 })).toBe(0.36);
    expect(marginOf({ profitCents: 0, revenueCents: 0 })).toBeNull();
  });
});

describe("roundToTotal", () => {
  it("gives the extra units to the largest remainders", () => {
    expect(roundToTotal([48.6, 14.6, 0.9, 35.9], 100)).toEqual([49, 14, 1, 36]);
    expect(roundToTotal([33.3, 33.3, 33.4], 100)).toEqual([33, 33, 34]);
  });
});

describe("explainRevenue", () => {
  it("splits a revenue change into orders and ticket", () => {
    expect(
      explainRevenue(
        { revenueCents: 1_246_200, orders: 83 },
        { revenueCents: 1_124_000, orders: 68 },
      ),
    ).toEqual({ kind: "change", revenue: 11, orders: 22, ticket: -9 });
  });

  it("has no baseline when the previous period sold nothing", () => {
    expect(
      explainRevenue({ revenueCents: 5_000, orders: 1 }, { revenueCents: 0, orders: 0 }),
    ).toEqual({
      kind: "no-baseline",
    });
  });

  it("calls a change under half a percent flat", () => {
    expect(
      explainRevenue({ revenueCents: 100_400, orders: 10 }, { revenueCents: 100_000, orders: 10 }),
    ).toEqual({ kind: "flat" });
  });

  it("keeps the real percentage even when the previous period barely sold", () => {
    expect(
      explainRevenue({ revenueCents: 5_382_600, orders: 372 }, { revenueCents: 29_400, orders: 3 }),
    ).toEqual({ kind: "change", revenue: 18_208, orders: 12_300, ticket: 48 });
  });

  it("has no ticket when the current period has no orders", () => {
    expect(
      explainRevenue({ revenueCents: 0, orders: 0 }, { revenueCents: 10_000, orders: 2 }),
    ).toEqual({
      kind: "change",
      revenue: -100,
      orders: -100,
      ticket: null,
    });
  });
});
