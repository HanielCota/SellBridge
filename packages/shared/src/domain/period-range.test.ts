import { describe, expect, it } from "vitest";
import { comparablePreviousRange, dayRangeWithin, resolvePeriod } from "./period-range.ts";
import { periodSearchSchema } from "../schemas/period.ts";

const now = new Date("2026-10-08T15:30:00Z");

describe("resolvePeriod", () => {
  it("resolves a preset ending today with an equal previous period", () => {
    const period = resolvePeriod({ period: "7d" }, now);
    expect(period).toMatchObject({
      days: 7,
      bucket: "day",
      fromDate: "2026-10-02",
      toDate: "2026-10-08",
    });
    expect(period.to.toISOString()).toBe("2026-10-09T03:00:00.000Z");
    expect(period.previousFrom.toISOString()).toBe("2026-09-25T03:00:00.000Z");
    expect(period.previousTo.toISOString()).toBe(period.from.toISOString());
  });

  it("uses Brazil calendar days (an evening in Brazil is still the same day)", () => {
    const lateEvening = new Date("2026-10-09T01:30:00Z"); // 22:30 on Oct 8 in Brasília
    expect(resolvePeriod({ period: "7d" }, lateEvening).toDate).toBe("2026-10-08");
  });

  it("uses weekly buckets for long periods", () => {
    expect(resolvePeriod({ period: "180d" }, now).bucket).toBe("week");
  });

  it("accepts the first and last years a custom range may use", () => {
    expect(
      resolvePeriod({ period: "custom", from: "2000-01-01", to: "2000-01-31" }, now),
    ).toMatchObject({ fromDate: "2000-01-01", previousFromDate: "1999-12-01" });
    expect(
      resolvePeriod({ period: "custom", from: "2100-12-01", to: "2100-12-31" }, now),
    ).toMatchObject({ toDate: "2100-12-31" });
  });

  it("resolves a valid custom range inclusively", () => {
    const period = resolvePeriod({ period: "custom", from: "2026-09-01", to: "2026-09-30" }, now);
    expect(period).toMatchObject({ days: 30, fromDate: "2026-09-01", toDate: "2026-09-30" });
  });

  it.each([
    [{ period: "custom" as const }],
    [{ period: "custom" as const, from: "2026-09-10" }],
    [{ period: "custom" as const, from: "2026-09-30", to: "2026-09-01" }],
    [{ period: "custom" as const, from: "2026-02-30", to: "2026-03-05" }],
    [{ period: "custom" as const, from: "2020-01-01", to: "2026-01-01" }],
    [{ period: "custom" as const, from: "0001-01-01", to: "0001-01-30" }],
    [{ period: "custom" as const, from: "1999-12-31", to: "2000-01-05" }],
    [{ period: "custom" as const, from: "2101-01-01", to: "2101-01-02" }],
    [{ period: "custom" as const, from: "9999-12-31", to: "9999-12-31" }],
  ])("falls back to 30 days for invalid custom input %j", (search) => {
    expect(resolvePeriod(search, now).days).toBe(30);
  });
});

describe("dayRangeWithin", () => {
  const period = resolvePeriod({ period: "7d" }, now);

  it("turns a day of the period into its Brazil-time range", () => {
    const range = dayRangeWithin(period, "2026-10-05");
    expect(range?.from.toISOString()).toBe("2026-10-05T03:00:00.000Z");
    expect(range?.to.toISOString()).toBe("2026-10-06T03:00:00.000Z");
  });

  it.each([undefined, "2026-10-01", "2026-10-09", "2026-02-30"])(
    "ignores %s (missing, outside the period or invalid)",
    (day) => {
      expect(dayRangeWithin(period, day)).toBeNull();
    },
  );
});

describe("periodSearchSchema", () => {
  it("defaults and drops garbage values", () => {
    expect(periodSearchSchema.parse({})).toEqual({ period: "30d" });
    expect(periodSearchSchema.parse({ period: "1y", store: "x", from: "ontem" })).toEqual({
      period: "30d",
    });
  });

  it("falls back to the last 30 days for a custom period outside 2000–2100", () => {
    const today = new Date("2026-10-14T12:00:00Z");
    for (const [from, to] of [
      ["0001-01-01", "0001-01-31"],
      ["1999-12-31", "2000-01-05"],
      ["2100-12-31", "2101-01-02"],
    ]) {
      expect(resolvePeriod({ period: "custom", from, to }, today).days).toBe(30);
    }
    expect(
      resolvePeriod({ period: "custom", from: "2000-01-01", to: "2000-01-31" }, today).days,
    ).toBe(31);
  });
});

describe("comparablePreviousRange", () => {
  const period = {
    from: new Date("2026-10-09T03:00:00Z"),
    to: new Date("2026-10-16T03:00:00Z"),
    previousFrom: new Date("2026-10-02T03:00:00Z"),
    previousTo: new Date("2026-10-09T03:00:00Z"),
  };

  // Regression: at 09:00 the current 7 days held 6 days and 9 hours against 7 whole days before.
  it("cuts the previous window to the stretch of the current one already lived", () => {
    const morning = new Date("2026-10-15T12:00:00Z");
    expect(comparablePreviousRange(period, morning)).toEqual({
      from: period.previousFrom,
      to: new Date("2026-10-08T12:00:00Z"),
    });
  });

  it("compares whole windows once the period is over", () => {
    expect(comparablePreviousRange(period, period.to)).toEqual({
      from: period.previousFrom,
      to: period.previousTo,
    });
    expect(comparablePreviousRange(period, new Date("2027-01-01T00:00:00Z")).to).toEqual(
      period.previousTo,
    );
  });

  it("compares whole windows for a period that has not started", () => {
    expect(comparablePreviousRange(period, new Date("2026-01-01T00:00:00Z")).to).toEqual(
      period.previousTo,
    );
  });
});
