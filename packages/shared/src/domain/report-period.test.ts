import { describe, expect, it } from "vitest";
import {
  monthLabel,
  reportPeriodLabel,
  reportPeriodSearchOf,
  resolveReportPeriod,
  shiftMonth,
  trendMonths,
} from "./report-period.ts";

// 27 Oct 2026, 10:00 in Brazil.
const NOW = new Date("2026-10-27T13:00:00.000Z");

describe("resolveReportPeriod", () => {
  it("defaults to the current month, partial up to today", () => {
    const period = resolveReportPeriod({}, NOW);
    expect(period).toMatchObject({
      kind: "month",
      month: "2026-10",
      status: "partial",
      fromDate: "2026-10-01",
      toDate: "2026-10-27",
      days: 27,
    });
    expect(period.from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-10-28T03:00:00.000Z");
  });

  it("compares a partial month with the same lived days of the month before", () => {
    const period = resolveReportPeriod({}, NOW);
    expect(period.previous).toMatchObject({
      month: "2026-09",
      fromDate: "2026-09-01",
      toDate: "2026-09-27",
    });
  });

  it("closes a past month and compares it with the whole month before", () => {
    const period = resolveReportPeriod({ mes: "2026-09" }, NOW);
    expect(period).toMatchObject({ status: "closed", toDate: "2026-09-30", days: 30 });
    expect(period.previous).toMatchObject({ fromDate: "2026-08-01", toDate: "2026-08-31" });
  });

  it("falls back to the current month for a month in the future", () => {
    expect(resolveReportPeriod({ mes: "2026-12" }, NOW).month).toBe("2026-10");
  });

  it("reads a range that is a whole month as that month", () => {
    const period = resolveReportPeriod({ de: "2026-09-01", ate: "2026-09-30" }, NOW);
    expect(period).toMatchObject({ kind: "month", month: "2026-09" });
  });

  it("keeps a range and compares it with the same number of days right before", () => {
    const period = resolveReportPeriod({ de: "2026-10-01", ate: "2026-10-15" }, NOW);
    expect(period).toMatchObject({ kind: "range", status: "closed", days: 15 });
    expect(period.previous).toMatchObject({ fromDate: "2026-09-16", toDate: "2026-09-30" });
  });

  it("stops a range at today and marks it partial", () => {
    const period = resolveReportPeriod({ de: "2026-10-20", ate: "2026-11-05" }, NOW);
    expect(period).toMatchObject({ kind: "range", status: "partial", toDate: "2026-10-27" });
  });

  it("falls back to the current month when the range is reversed", () => {
    expect(resolveReportPeriod({ de: "2026-10-20", ate: "2026-10-01" }, NOW).kind).toBe("month");
  });
});

describe("month helpers", () => {
  it("crosses the year when shifting months", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("names the month in Portuguese", () => {
    expect(monthLabel("2026-10")).toBe("Outubro de 2026");
  });

  it("lists the six trend months ending at the period", () => {
    expect(trendMonths({ toDate: "2026-02-10" })).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("labels and links a range by its dates", () => {
    const range = resolveReportPeriod({ de: "2026-10-01", ate: "2026-10-15" }, NOW);
    expect(reportPeriodLabel(range)).toBe("01/10 a 15/10");
    expect(reportPeriodSearchOf(range)).toEqual({ de: "2026-10-01", ate: "2026-10-15" });
  });
});
