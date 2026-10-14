import { describe, expect, it } from "vitest";
import { formatAbsoluteTime, formatRelativeTime, formatSmartDate } from "./relative-time";

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
