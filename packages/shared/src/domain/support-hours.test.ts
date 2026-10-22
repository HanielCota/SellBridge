import { describe, expect, it } from "vitest";
import { isWithinSupportHours, SUPPORT_HOURS } from "./support-hours.ts";

/** A wall-clock time in Brasília (UTC−3, no daylight saving since 2019). */
function brasilia(dateAndTime: string): Date {
  return new Date(`${dateAndTime}-03:00`);
}

describe("SUPPORT_HOURS", () => {
  it("opens every day from 8h to 18h in Brasília time", () => {
    expect(SUPPORT_HOURS).toEqual({
      opensAtHour: 8,
      closesAtHour: 18,
      timeZone: "America/Sao_Paulo",
    });
  });
});

describe("isWithinSupportHours", () => {
  it.each([
    ["2026-10-21T07:59:59", false],
    ["2026-10-21T08:00:00", true],
    ["2026-10-21T12:30:00", true],
    ["2026-10-21T17:59:59", true],
    ["2026-10-21T18:00:00", false],
    ["2026-10-21T23:00:00", false],
    ["2026-10-21T00:00:00", false],
  ])("at %s in Brasília answers %s", (time, expected) => {
    expect(isWithinSupportHours(brasilia(time))).toBe(expected);
  });

  it("is open on Saturday and Sunday mornings too", () => {
    expect(isWithinSupportHours(brasilia("2026-10-24T10:00:00"))).toBe(true);
    expect(isWithinSupportHours(brasilia("2026-10-25T10:00:00"))).toBe(true);
  });

  it("follows the São Paulo clock when UTC is already on the next day", () => {
    // 02:00 UTC on the 22nd is 23:00 on the 21st in Brasília: closed.
    expect(isWithinSupportHours(new Date("2026-10-22T02:00:00Z"))).toBe(false);
    // 11:00 UTC is 08:00 in Brasília: open, although UTC says 11h.
    expect(isWithinSupportHours(new Date("2026-10-22T11:00:00Z"))).toBe(true);
    // 20:30 UTC is 17:30 in Brasília: still open, although UTC is past 18h.
    expect(isWithinSupportHours(new Date("2026-10-22T20:30:00Z"))).toBe(true);
  });

  it("refuses an invalid date instead of guessing", () => {
    expect(() => isWithinSupportHours(new Date(Number.NaN))).toThrow(
      expect.objectContaining({
        code: "VALIDATION",
        message: expect.stringContaining("Invalid Date"),
      }),
    );
  });
});
