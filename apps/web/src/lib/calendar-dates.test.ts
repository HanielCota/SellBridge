import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  clampDay,
  daysBetween,
  FIRST_CALENDAR_DAY,
  monthWeeks,
  startOfMonth,
  weekdayOf,
} from "./calendar-dates";

describe("calendar dates", () => {
  it("moves by days and months in UTC, clamping to the month's last day", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(daysBetween("2026-01-01", "2026-03-01")).toBe(59);
    expect(startOfMonth("2026-10-16", -1)).toBe("2026-09-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-03-15", -12)).toBe("2025-03-15");
    expect(weekdayOf("2026-03-01")).toBe(0);
  });

  it("keeps a day between the first report day and the latest allowed", () => {
    expect(clampDay("1999-12-31", "2026-10-16")).toBe(FIRST_CALENDAR_DAY);
    expect(clampDay("2026-10-17", "2026-10-16")).toBe("2026-10-16");
    expect(clampDay("2026-05-05", "2026-10-16")).toBe("2026-05-05");
  });

  it("lays a month out in whole weeks, padding outside it with null", () => {
    // March 2026 starts on a Sunday and has 31 days: five weeks, the last with four blanks.
    const weeks = monthWeeks("2026-03-01");
    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.[0]).toBe("2026-03-01");
    expect(weeks[4]).toEqual(["2026-03-29", "2026-03-30", "2026-03-31", null, null, null, null]);
    // October 2026 starts on a Thursday: four leading blanks.
    expect(monthWeeks("2026-10-01")[0]?.slice(0, 5)).toEqual([
      null,
      null,
      null,
      null,
      "2026-10-01",
    ]);
  });
});
