import { describe, expect, it } from "vitest";
import { brazilDayKey, formatRelativeTime, formatSmartDate, nearDayName } from "./relative-time";

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
