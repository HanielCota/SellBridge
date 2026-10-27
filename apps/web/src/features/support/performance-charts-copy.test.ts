import type { HeatCell, SeriesPoint } from "@sellbridge/shared/support-performance";
import { describe, expect, it } from "vitest";
import { outsideSummary, peakText, peakWindow, slowestCell } from "./performance-hours";
import { subjectTrend } from "./performance-people";
import { bucketComparison, kindPoints } from "./support-chart-kinds";

function point(start: string, opened: number, resolved: number): SeriesPoint {
  return {
    start,
    opened,
    resolved,
    previousOpened: 0,
    previousResolved: resolved - 1,
    healthLevel: "on_target",
    firstResponseMinutes: null,
    teamResolvedPerAgent: 0,
    onTimeRate: null,
    lateFirstResponses: 0,
    noReopenRate: null,
    rating: null,
    openedByCategory: {},
    topSituationByCategory: {},
  };
}

function cell(weekday: number, hour: HeatCell["hour"], opened: number, wait: number | null) {
  const heat: HeatCell = {
    weekday,
    hour,
    opened,
    firstResponseMinutes: wait,
    responders: 1,
    topSubject: null,
    recent: [],
  };
  return heat;
}

describe("subjectTrend", () => {
  it("shows the change in percent with the base it came from", () => {
    expect(subjectTrend({ current: 21, previous: 15 })).toEqual({
      text: "↑ 40% · era 15",
      tone: "up",
      rising: false,
    });
  });

  it("calls a jump of three tickets and half again a spike", () => {
    expect(subjectTrend({ current: 15, previous: 10 }).rising).toBe(true);
  });

  it("does not call a small increase a spike", () => {
    expect(subjectTrend({ current: 12, previous: 10 }).rising).toBe(false);
  });

  it("counts tickets instead of a percent when the previous period had none", () => {
    expect(subjectTrend({ current: 4, previous: 0 }).text).toBe("↑ 4 · era 0");
  });

  it("calls an unchanged subject stable", () => {
    expect(subjectTrend({ current: 5, previous: 5 })).toMatchObject({ tone: "flat" });
  });
});

describe("kindPoints", () => {
  const series = [point("2026-10-20", 5, 3), point("2026-10-21", 2, 4)];

  it("adds up from the first bucket in the cumulative kind", () => {
    const [, second] = kindPoints(series, "cumulative");
    expect(second).toMatchObject({ opened: 7, resolved: 7, previousResolved: 5 });
  });

  it("keeps each bucket's balance and rate whatever the kind", () => {
    const [first, second] = kindPoints(series, "cumulative");
    expect(first).toMatchObject({ balance: 2, rate: 0.6 });
    expect(second).toMatchObject({ balance: -2, rate: 2 });
  });

  it("has no rate for a bucket where nothing came in", () => {
    const [only] = kindPoints([point("2026-10-20", 0, 1)], "rate");
    expect(only?.rate).toBeNull();
  });
});

describe("bucketComparison", () => {
  const points = kindPoints(
    [point("2026-10-20", 5, 4), point("2026-10-21", 5, 5), point("2026-10-22", 5, 5)],
    "bars",
  );

  it("compares the resolutions with the bucket before", () => {
    expect(bucketComparison(points, 1, "day")).toBe("Resolvidos ↑ 25% vs. o dia anterior");
  });

  it("has nothing to compare in the first bucket", () => {
    expect(bucketComparison(points, 0, "day")).toBeNull();
  });
});

describe("hours map", () => {
  const cells = [
    cell(0, 9, 3, 20),
    cell(0, 10, 4, 90),
    cell(1, 9, 6, 30),
    cell(1, 10, 0, null),
    cell(0, "outside", 7, 600),
  ];

  it("finds the two support hours with the most tickets", () => {
    const peak = peakWindow(cells);
    expect(peak).toEqual({ weekday: 0, from: 9, opened: 7 });
    expect(peak === null ? null : peakText(peak)).toBe("seg, 9h–11h");
  });

  it("measures what arrives with the team closed", () => {
    expect(outsideSummary(cells)).toEqual({ share: 0.35, minutes: 600 });
  });

  it("leaves the closed hours out of the slowest hour", () => {
    expect(slowestCell(cells)).toMatchObject({ weekday: 0, hour: 10 });
  });
});
