import { describe, expect, it } from "vitest";
import { buildKpiStory, hasKpiData, type KpiMeasure } from "./kpi-story";

interface Day {
  date: string;
  orders: number;
  revenueCents: number;
}

const ORDERS: KpiMeasure<Day> = { amount: (point) => point.orders };
const TICKET: KpiMeasure<Day> = {
  amount: (point) => point.revenueCents,
  per: (point) => point.orders,
};

function day(date: string, orders: number, revenueCents = orders * 1000): Day {
  return { date, orders, revenueCents };
}

const current = [day("2026-11-01", 3), day("2026-11-02", 0), day("2026-11-03", 5)];
const previous = [day("2026-10-29", 1), day("2026-10-30", 4), day("2026-10-31", 2)];

describe("buildKpiStory", () => {
  it("pairs each day with the same day of the previous period", () => {
    const story = buildKpiStory(current, previous, ORDERS, 3);

    expect(story).toEqual([
      { date: "2026-11-01", value: 3, previous: 1 },
      { date: "2026-11-02", value: 0, previous: 4 },
      { date: "2026-11-03", value: 5, previous: 2 },
    ]);
  });

  it("leaves the previous value empty without a previous series", () => {
    const story = buildKpiStory(current, null, ORDERS, 3);

    expect(story.map((point) => point.previous)).toEqual([null, null, null]);
  });

  it("leaves the previous value empty where no previous day lands", () => {
    const story = buildKpiStory(current, [day("2026-10-30", 4)], ORDERS, 3);

    expect(story.map((point) => point.previous)).toEqual([null, 4, null]);
  });

  it("adds up the previous weeks that land in the same week", () => {
    const weeks = [day("2026-11-02", 7), day("2026-11-09", 9)];
    const lastWeeks = [day("2026-10-19", 2), day("2026-10-20", 3), day("2026-10-26", 6)];

    const story = buildKpiStory(weeks, lastWeeks, ORDERS, 14);

    expect(story.map((point) => point.previous)).toEqual([5, 6]);
  });

  it("reads an average ticket as the bucket's revenue over its orders, rounded", () => {
    const story = buildKpiStory(
      [day("2026-11-01", 3, 10_000)],
      [day("2026-10-31", 2, 9_001)],
      TICKET,
      1,
    );

    expect(story).toEqual([{ date: "2026-11-01", value: 3333, previous: 4501 }]);
  });

  it("leaves an average empty on a day without orders, now and before", () => {
    const story = buildKpiStory([day("2026-11-01", 0, 0)], [day("2026-10-31", 0, 0)], TICKET, 1);

    expect(story).toEqual([{ date: "2026-11-01", value: null, previous: null }]);
  });

  it("never passes on a value that is not a number", () => {
    const broken = [day("2026-11-01", Number.NaN, Number.POSITIVE_INFINITY)];

    const orders = buildKpiStory(broken, null, ORDERS, 1);
    const ticket = buildKpiStory(broken, null, TICKET, 1);

    expect(orders[0]?.value).toBeNull();
    expect(ticket[0]?.value).toBeNull();
  });

  it("returns no buckets for an empty period", () => {
    expect(buildKpiStory([], previous, ORDERS, 3)).toEqual([]);
  });
});

describe("hasKpiData", () => {
  it("is false when neither period has a value above zero", () => {
    const story = buildKpiStory([day("2026-11-01", 0)], [day("2026-10-31", 0)], ORDERS, 1);

    expect(hasKpiData(story)).toBe(false);
  });

  it("is true when only the previous period sold", () => {
    const story = buildKpiStory([day("2026-11-01", 0)], [day("2026-10-31", 2)], ORDERS, 1);

    expect(hasKpiData(story)).toBe(true);
  });
});
