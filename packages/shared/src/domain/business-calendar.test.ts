import { describe, expect, it } from "vitest";
import {
  brazilNationalHolidays,
  brazilNationalHolidaysBetween,
  easterSunday,
  firstBusinessDayFrom,
  isBrazilBusinessDay,
} from "./business-calendar.ts";

describe("easterSunday", () => {
  it("finds the published Easter Sundays", () => {
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2038)).toBe("2038-04-25");
  });
});

describe("brazilNationalHolidays", () => {
  it("lists the fixed holidays, Carnaval, Good Friday and Corpus Christi of 2026", () => {
    const holidays = brazilNationalHolidays(2026);

    expect(holidays).toEqual([
      "2026-01-01",
      "2026-02-16",
      "2026-02-17",
      "2026-04-03",
      "2026-04-21",
      "2026-05-01",
      "2026-06-04",
      "2026-09-07",
      "2026-10-12",
      "2026-11-02",
      "2026-11-15",
      "2026-11-20",
      "2026-12-25",
    ]);
  });

  it("throws RangeError for a year outside the calendar", () => {
    expect(() => brazilNationalHolidays(1800)).toThrow(RangeError);
    expect(() => brazilNationalHolidays(2026.5)).toThrow(RangeError);
  });

  it("joins the years of a range", () => {
    const holidays = brazilNationalHolidaysBetween(2026, 2027);

    expect(holidays).toHaveLength(26);
    expect(holidays).toContain("2027-03-26");
  });
});

describe("isBrazilBusinessDay", () => {
  it("counts an ordinary weekday", () => {
    expect(isBrazilBusinessDay("2026-11-19")).toBe(true);
  });

  it("skips the weekend", () => {
    expect(isBrazilBusinessDay("2026-11-21")).toBe(false);
    expect(isBrazilBusinessDay("2026-11-22")).toBe(false);
  });

  it("skips a national holiday on a weekday", () => {
    expect(isBrazilBusinessDay("2026-11-20")).toBe(false);
    expect(isBrazilBusinessDay("2026-02-17")).toBe(false);
  });
});

describe("firstBusinessDayFrom", () => {
  it("keeps a business day", () => {
    expect(firstBusinessDayFrom("2026-11-19")).toBe("2026-11-19");
  });

  it("moves a holiday Friday and the weekend to Monday", () => {
    expect(firstBusinessDayFrom("2026-11-20")).toBe("2026-11-23");
  });

  it("moves the Carnaval weekend past Monday and Tuesday to Ash Wednesday", () => {
    expect(firstBusinessDayFrom("2026-02-14")).toBe("2026-02-18");
  });
});
