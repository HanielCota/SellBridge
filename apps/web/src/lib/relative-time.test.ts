import { describe, expect, it } from "vitest";
import {
  brazilDayKey,
  formatAbsoluteTime,
  formatRelativeTime,
  formatSmartDate,
  nearDayName,
} from "./relative-time";

const now = new Date("2026-10-09T12:00:00Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe("formatRelativeTime", () => {
  it("says 'agora' for the last minute", () => {
    expect(formatRelativeTime(ago(20), now)).toBe("agora");
  });

  it("uses the largest whole unit", () => {
    expect(formatRelativeTime(ago(5 * 60), now)).toBe("há 5 minutos");
    expect(formatRelativeTime(ago(2 * 3600), now)).toBe("há 2 horas");
    expect(formatRelativeTime(ago(86_400), now)).toBe("ontem");
    expect(formatRelativeTime(ago(14 * 86_400), now)).toBe("há 2 semanas");
  });
});

describe("calendar days", () => {
  it("counts days by the calendar in Brazil time, not by 24-hour blocks", () => {
    // Wednesday 09:00 in Brazil (12:00 UTC); Monday 21:00 in Brazil is 36 hours earlier.
    const wednesdayMorning = new Date("2026-10-14T12:00:00Z");
    expect(formatRelativeTime(new Date("2026-10-13T00:00:00Z"), wednesdayMorning)).toBe(
      "anteontem",
    );
    expect(formatRelativeTime(new Date("2026-10-13T06:00:00Z"), wednesdayMorning)).toBe("ontem");
  });

  it("dates by Brazil's day even when the server runs in UTC", () => {
    // 23:30 on 9 October in Brazil is already 10 October in UTC.
    const lateEvening = new Date("2026-10-10T02:30:00Z");
    expect(formatSmartDate(lateEvening, new Date("2026-11-20T12:00:00Z"))).toBe("9 de out.");
  });
});

describe("formatSmartDate", () => {
  it("is relative within the last week", () => {
    expect(formatSmartDate(ago(3 * 3600), now)).toBe("há 3 horas");
    expect(formatSmartDate(ago(2 * 86_400), now)).toBe("anteontem");
  });

  it("shows day and month after a week, and the year only for other years", () => {
    expect(formatSmartDate(new Date("2026-09-15T12:00:00Z"), now)).toBe("15 de set.");
    expect(formatSmartDate(new Date("2025-12-20T12:00:00Z"), now)).toBe("20 de dez. de 2025");
  });

  it("counts calendar days in São Paulo, not 24-hour blocks", () => {
    // Monday 10:00 seen Tuesday 23:00 (37 h): yesterday. Monday 23:50 seen Wednesday 00:10: two days.
    const tuesdayNight = new Date("2026-10-07T02:00:00Z");
    expect(formatRelativeTime(new Date("2026-10-05T13:00:00Z"), tuesdayNight)).toBe("ontem");
    const wednesdayEarly = new Date("2026-10-07T03:10:00Z");
    expect(formatRelativeTime(new Date("2026-10-06T02:50:00Z"), wednesdayEarly)).toBe("anteontem");
  });

  it("reads the day and the year in São Paulo, whatever the server's zone", () => {
    // 22:30 in São Paulo is already 01:30 of the next day in UTC.
    expect(formatSmartDate(new Date("2026-09-15T01:30:00Z"), now)).toBe("14 de set.");
    expect(formatSmartDate(new Date("2026-01-01T01:00:00Z"), now)).toBe("31 de dez. de 2025");
    expect(formatAbsoluteTime(new Date("2026-09-15T01:30:00Z"))).toBe("14/09/2026, 22:30");
  });
});

describe("brazilDayKey", () => {
  it("reads the day in Brazil time, not UTC", () => {
    expect(brazilDayKey(new Date("2026-10-10T02:00:00Z"))).toBe("2026-10-09");
    expect(brazilDayKey(new Date("2026-10-10T03:00:00Z"))).toBe("2026-10-10");
  });
});

describe("nearDayName", () => {
  const today = new Date("2026-10-10T15:00:00Z");

  it("names today and yesterday in Brazil time", () => {
    expect(nearDayName("2026-10-10", today)).toBe("Hoje");
    expect(nearDayName("2026-10-09", today)).toBe("Ontem");
    expect(nearDayName("2026-10-09", new Date("2026-10-10T02:00:00Z"))).toBe("Hoje");
  });

  it("leaves any other day to the caller", () => {
    expect(nearDayName("2026-10-08", today)).toBeNull();
    expect(nearDayName("2026-10-11", today)).toBeNull();
  });
});
