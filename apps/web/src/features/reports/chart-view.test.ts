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
  {
    date: "2026-09-01",
    orders: 2,
    revenueCents: 10_000,
    profitCents: 2_000,
    pendingCostRevenueCents: 0,
  },
  { date: "2026-09-02", orders: 0, revenueCents: 0, profitCents: 0, pendingCostRevenueCents: 0 },
  {
    date: "2026-09-03",
    orders: 1,
    revenueCents: 30_000,
    profitCents: -3_000,
    pendingCostRevenueCents: 0,
  },
];

const previous = {
  points: [
    {
      date: "2026-08-02",
      orders: 1,
      revenueCents: 5_000,
      profitCents: 1_000,
      pendingCostRevenueCents: 0,
    },
    {
      date: "2026-08-03",
      orders: 1,
      revenueCents: 5_000,
      profitCents: 1_000,
      pendingCostRevenueCents: 0,
    },
    {
      date: "2026-08-04",
      orders: 1,
      revenueCents: 5_000,
      profitCents: 1_000,
      pendingCostRevenueCents: 0,
    },
  ],
  offsetDays: 30,
};

const week = (date: string, revenueCents: number) => ({
  date,
  orders: 1,
  revenueCents,
  profitCents: revenueCents / 10,
  pendingCostRevenueCents: 0,
});

/** `count` weekly buckets from the Monday `first`, the revenue of each from its position. */
function weeksFrom(first: string, count: number, revenueAt: (index: number) => number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${first}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index * 7);
    return week(date.toISOString().slice(0, 10), revenueAt(index));
  });
}

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

  it("keeps the revenue of unknown cost apart from the costs and the margin", () => {
    const [point] = buildChartPoints([
      {
        date: "2026-09-01",
        orders: 3,
        revenueCents: 30_000,
        profitCents: 4_000,
        pendingCostRevenueCents: 10_000,
      },
    ]);
    expect(point).toMatchObject({ revenue: 30_000, pending: 10_000, cost: 16_000, margin: 20 });
  });

  it("carries the pending revenue in running totals", () => {
    const pendingPoints = points.map((point) => ({ ...point, pendingCostRevenueCents: 1_000 }));
    expect(buildChartPoints(pendingPoints, { cumulative: true }).at(-1)?.pending).toBe(3_000);
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

  it("keeps the previous period's last week when it has one bucket more", () => {
    // 90 days from Tuesday 2026-07-07 make 13 weeks; the 90 days before (from Wednesday
    // 2026-04-08 to Monday 2026-07-06) touch 14, the last of them a single day.
    const current = weeksFrom("2026-07-06", 13, () => 100);
    const before = weeksFrom("2026-04-06", 14, (index) => (index + 1) * 1_000);
    const chart = buildChartPoints(current, { previous: { points: before, offsetDays: 90 } });
    // The one-day last week joins the week before it instead of being dropped.
    expect(chart.map((point) => point.previousRevenue)).toEqual([
      1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000, 10_000, 11_000, 12_000, 27_000,
    ]);
  });

  it("lines weeks up by date when the previous period has one bucket fewer", () => {
    // 60 days from Friday 2026-07-03: a 3-day first week, then 9 more. The 60 days before start
    // on Monday 2026-05-04, so their first week lands on the current second one, not the first.
    const current = weeksFrom("2026-06-29", 10, () => 100);
    const before = weeksFrom("2026-05-04", 9, (index) => (index + 1) * 1_000);
    const chart = buildChartPoints(current, { previous: { points: before, offsetDays: 60 } });
    expect(chart[0]?.previousRevenue).toBeNull();
    expect(chart.slice(1).map((point) => point.previousRevenue)).toEqual([
      1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000,
    ]);
    expect(chart[0]?.previousAverageRevenue).toBeNull();
    expect(chart[2]?.previousAverageRevenue).toBe(1_500);
  });

  it("adds up the previous period's running total over the matched buckets", () => {
    const current = [week("2026-09-07", 100), week("2026-09-14", 100), week("2026-09-21", 100)];
    const before = [week("2026-08-24", 1_000), week("2026-08-31", 2_000)];
    const chart = buildChartPoints(current, {
      previous: { points: before, offsetDays: 14 },
      cumulative: true,
    });
    expect(chart.map((point) => point.previousRevenue)).toEqual([1_000, 3_000, null]);
  });
});

describe("groupByWeek", () => {
  it("sums days into weeks that start on Monday, dated by their first day", () => {
    const days = [
      {
        date: "2026-09-06",
        orders: 1,
        revenueCents: 100,
        profitCents: 10,
        pendingCostRevenueCents: 0,
      },
      {
        date: "2026-09-07",
        orders: 1,
        revenueCents: 200,
        profitCents: 20,
        pendingCostRevenueCents: 0,
      },
      {
        date: "2026-09-13",
        orders: 2,
        revenueCents: 300,
        profitCents: 30,
        pendingCostRevenueCents: 0,
      },
    ];
    expect(groupByWeek(days)).toEqual([
      {
        date: "2026-09-06",
        orders: 1,
        revenueCents: 100,
        profitCents: 10,
        pendingCostRevenueCents: 0,
      },
      {
        date: "2026-09-07",
        orders: 3,
        revenueCents: 500,
        profitCents: 50,
        pendingCostRevenueCents: 0,
      },
    ]);
  });
});

describe("groupByWeek with pending revenue", () => {
  it("adds up the pending revenue of the week", () => {
    const days = ["2026-09-07", "2026-09-08"].map((date) => ({
      date,
      orders: 1,
      revenueCents: 5_000,
      profitCents: 1_000,
      pendingCostRevenueCents: 2_000,
    }));
    expect(groupByWeek(days)).toEqual([
      {
        date: "2026-09-07",
        orders: 2,
        revenueCents: 10_000,
        profitCents: 2_000,
        pendingCostRevenueCents: 4_000,
      },
    ]);
  });
});

describe("niceScale", () => {
  it("keeps a handful of ticks when a deep loss dwarfs a tiny gain", () => {
    const { ticks, domain } = niceScale([1, -500_000]);
    expect(ticks.length).toBeLessThanOrEqual(8);
    expect(domain[0]).toBeLessThanOrEqual(-500_000);
    expect(domain[1]).toBeGreaterThan(1);
  });

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
    pendingCostRevenueCents: 0,
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

  it("sets the revenue of unknown cost apart before the costs", () => {
    const steps = buildWaterfall({
      ...summary,
      costCents: 40_000,
      pendingCostRevenueCents: 20_000,
      profitCents: 27_000,
    });
    expect(steps.slice(0, 3)).toEqual([
      { key: "revenue", label: "Receita", cents: 100_000, range: [0, 100_000] },
      { key: "pending", label: "Custo pendente", cents: -20_000, range: [80_000, 100_000] },
      { key: "cost", label: "Custo dos produtos", cents: -40_000, range: [40_000, 80_000] },
    ]);
    expect(steps.at(-1)).toMatchObject({ key: "profit", cents: 27_000 });
  });

  it("hangs a loss below zero", () => {
    const loss = buildWaterfall({
      ...summary,
      costCents: 95_000,
      profitCents: -8_000,
      pendingCostRevenueCents: 0,
    });
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

  it("leaves the revenue of unknown cost out of the margin", () => {
    const day = {
      date: "2026-09-01",
      orders: 2,
      revenueCents: 20_000,
      profitCents: 2_000,
      pendingCostRevenueCents: 10_000,
    };
    expect(periodMargin([day])).toBe(20);
    expect(periodMargin([{ ...day, profitCents: 0, pendingCostRevenueCents: 20_000 }])).toBeNull();
  });
});

describe("hasSales", () => {
  it("is false when every bucket is zero", () => {
    expect(
      hasSales([
        {
          date: "2026-09-02",
          orders: 0,
          revenueCents: 0,
          profitCents: 0,
          pendingCostRevenueCents: 0,
        },
      ]),
    ).toBe(false);
    expect(hasSales(points)).toBe(true);
  });
});
