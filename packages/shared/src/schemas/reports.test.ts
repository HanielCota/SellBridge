import { describe, expect, it } from "vitest";
import { periodSearchSchema, resolvePeriod } from "./reports.ts";

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
  ])("falls back to 30 days for invalid custom input %j", (search) => {
    expect(resolvePeriod(search, now).days).toBe(30);
  });
});

describe("periodSearchSchema", () => {
  it("defaults and drops garbage values", () => {
    expect(periodSearchSchema.parse({})).toEqual({ period: "30d" });
    expect(periodSearchSchema.parse({ period: "1y", store: "x", from: "ontem" })).toEqual({
      period: "30d",
    });
  });
});
