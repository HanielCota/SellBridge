import { describe, expect, it } from "vitest";
import {
  buildChartPoints,
  buildWaterfall,
  groupByWeek,
  hasSales,
  niceScale,
  periodMargin,
} from "./chart-view";

const points = [
  { date: "2026-09-01", orders: 2, revenueCents: 10_000, profitCents: 2_000 },
  { date: "2026-09-02", orders: 0, revenueCents: 0, profitCents: 0 },
  { date: "2026-09-03", orders: 1, revenueCents: 30_000, profitCents: -3_000 },
];

const previous = [
  { date: "2026-08-02", orders: 1, revenueCents: 5_000, profitCents: 1_000 },
  { date: "2026-08-03", orders: 1, revenueCents: 5_000, profitCents: 1_000 },
  { date: "2026-08-04", orders: 1, revenueCents: 5_000, profitCents: 1_000 },
];

describe("buildChartPoints", () => {
  it("splits revenue into cost and profit", () => {
    expect(buildChartPoints(points)[0]).toMatchObject({
      date: "2026-09-01",
      revenue: 10_000,
      profit: 2_000,
      cost: 8_000,
      margin: 20,
    });
  });

  it("leaves the margin empty on a day without sales", () => {
    expect(buildChartPoints(points)[1]?.margin).toBeNull();
  });

  it("keeps a loss as a negative margin", () => {
    expect(buildChartPoints(points)[2]?.margin).toBe(-10);
  });

  it("averages over the days seen so far", () => {
    expect(buildChartPoints(points).map((point) => point.averageRevenue)).toEqual([
      10_000, 5_000, 13_333,
    ]);
  });

  it("lines the previous period up bucket by bucket", () => {
    const chart = buildChartPoints(points, { previous });
    expect(chart.map((point) => point.previousRevenue)).toEqual([5_000, 5_000, 5_000]);
    expect(buildChartPoints(points)[0]?.previousRevenue).toBeNull();
  });

  it("smooths the previous period like the current one", () => {
    const chart = buildChartPoints(points, { previous });
    expect(chart.map((point) => point.previousAverageProfit)).toEqual([1_000, 1_000, 1_000]);
  });

  it("carries running totals for both periods when cumulative", () => {
    const cumulative = buildChartPoints(points, { previous, cumulative: true });
    expect(cumulative.map((point) => point.revenue)).toEqual([10_000, 10_000, 40_000]);
    expect(cumulative.map((point) => point.profit)).toEqual([2_000, 2_000, -1_000]);
    expect(cumulative.map((point) => point.previousProfit)).toEqual([1_000, 2_000, 3_000]);
    expect(cumulative[2]?.margin).toBe(-2.5);
    expect(cumulative[2]?.averageRevenue).toBeNull();
  });
});

describe("groupByWeek", () => {
  it("sums days into weeks that start on Monday, dated by their first day", () => {
    const days = [
      { date: "2026-09-06", orders: 1, revenueCents: 100, profitCents: 10 },
      { date: "2026-09-07", orders: 1, revenueCents: 200, profitCents: 20 },
      { date: "2026-09-13", orders: 2, revenueCents: 300, profitCents: 30 },
    ];
    expect(groupByWeek(days)).toEqual([
      { date: "2026-09-06", orders: 1, revenueCents: 100, profitCents: 10 },
      { date: "2026-09-07", orders: 3, revenueCents: 500, profitCents: 50 },
    ]);
  });
});

describe("niceScale", () => {
  it("starts at zero with round steps", () => {
    expect(niceScale([0, 120_000, 150_000]).ticks).toEqual([0, 50_000, 100_000, 150_000]);
  });

  it("keeps room above a value that almost reaches the top tick", () => {
    const scale = niceScale([0, 156_300]);
    expect(scale.ticks.at(-1)).toBe(160_000);
    expect(scale.domain[1]).toBeGreaterThan(160_000);
  });

  it("frames a small loss with a labeled half-step tick", () => {
    const scale = niceScale([-5_559, 156_300]);
    expect(scale.ticks[0]).toBe(-20_000);
    expect(scale.ticks).toContain(0);
    expect(scale.domain[0]).toBeLessThanOrEqual(-20_000);
  });

  it("frames a deep loss with whole steps", () => {
    expect(niceScale([-40_000, 100_000]).ticks[0]).toBe(-50_000);
  });

  it("never lets a value touch the edge of the plot", () => {
    for (const values of [
      [0, 156_300],
      [-5_559, 156_300],
      [-40_000, 100_000],
      [0, 2_190_000],
      [27.1, 28.4],
      [-12, 30],
    ]) {
      const { domain } = niceScale(values);
      expect(Math.min(...values)).toBeGreaterThanOrEqual(domain[0]);
      expect(Math.max(...values)).toBeLessThan(domain[1]);
    }
  });

  it("keeps the top close to the largest value", () => {
    expect(niceScale([0, 2_190_000]).ticks.at(-1)).toBe(2_500_000);
  });

  it("handles an empty chart", () => {
    expect(niceScale([0, 0]).ticks).toEqual([0]);
  });
});

describe("buildWaterfall", () => {
  const summary = {
    revenueCents: 100_000,
    costCents: 50_000,
    feeCents: 12_000,
    platformFeeCents: 2_000,
    refundCents: 0,
    commissionCents: 1_000,
    profitCents: 37_000,
  };

  it("walks from revenue down to profit", () => {
    expect(buildWaterfall(summary)).toEqual([
      { key: "revenue", label: "Receita", cents: 100_000, range: [0, 100_000] },
      { key: "cost", label: "Custo dos produtos", cents: -50_000, range: [50_000, 100_000] },
      { key: "fee", label: "Taxas do marketplace", cents: -14_000, range: [36_000, 50_000] },
      { key: "gain", label: "Comissões recebidas", cents: 1_000, range: [36_000, 37_000] },
      { key: "profit", label: "Lucro", cents: 37_000, range: [0, 37_000] },
    ]);
  });

  it("hangs a loss below zero", () => {
    const loss = buildWaterfall({ ...summary, costCents: 95_000, profitCents: -8_000 });
    expect(loss.at(-1)?.range).toEqual([-8_000, 0]);
  });
});

describe("periodMargin", () => {
  it("weights by revenue", () => {
    expect(periodMargin(points)).toBe(-2.5);
  });

  it("is empty without revenue", () => {
    expect(periodMargin([])).toBeNull();
  });
});

describe("hasSales", () => {
  it("is false when every bucket is zero", () => {
    expect(hasSales([{ date: "2026-09-02", orders: 0, revenueCents: 0, profitCents: 0 }])).toBe(
      false,
    );
    expect(hasSales(points)).toBe(true);
  });
});
