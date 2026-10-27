import { SUPPORT_HOURS } from "../support-hours.ts";
import { DAY_MILLISECONDS } from "../time.ts";
import type { SupportBucket } from "./types.ts";

/*
 * Dates on the Brasília calendar, whatever the server's zone: the day a reply counts for, the
 * bucket a ticket falls in and the cell of the hours heatmap.
 */

const brazilDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: SUPPORT_HOURS.timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// `h23` keeps midnight as 0; some engines report it as 24 under the default cycle.
const brazilClock = new Intl.DateTimeFormat("en-US", {
  timeZone: SUPPORT_HOURS.timeZone,
  weekday: "short",
  hour: "numeric",
  hourCycle: "h23",
});

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/** YYYY-MM-DD of `date` in Brasília. */
export function brazilDay(date: Date): string {
  return brazilDate.format(date);
}

/** Calendar arithmetic on a YYYY-MM-DD string, free of time zones. */
function shiftDay(day: string, days: number): string {
  const shifted = new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MILLISECONDS);
  return shifted.toISOString().slice(0, 10);
}

function weekdayOfDay(day: string): number {
  // 12:00 UTC stays on the same calendar day; getUTCDay counts from Sunday.
  return (new Date(Date.parse(`${day}T12:00:00Z`)).getUTCDay() + 6) % 7;
}

/** The Monday that starts the week of `day`. */
function mondayOf(day: string): string {
  return shiftDay(day, -weekdayOfDay(day));
}

/** One bucket key per hour of the Brasília day: "2026-10-25T09". */
function hourKey(day: string, hour: number): string {
  return `${day}T${String(hour).padStart(2, "0")}`;
}

/**
 * Every bucket from `since` to `until` (exclusive), oldest first. Hours cover one day up to the
 * current hour (the hours still to come would read as a drop to zero). Weeks start on Monday,
 * except the first, which starts on the period's first day, so it never counts days outside it.
 */
export function bucketStarts(since: Date, until: Date, kind: SupportBucket): string[] {
  const first = brazilDay(since);
  const last = brazilDay(new Date(until.getTime() - 1));
  if (kind === "hour") {
    const lastHour = brazilDay(until) === first ? brazilWeekdayHour(until).hour : 23;
    return Array.from({ length: lastHour + 1 }, (_, hour) => hourKey(first, hour));
  }
  if (kind === "day") {
    const starts: string[] = [];
    for (let day = first; day <= last; day = shiftDay(day, 1)) {
      starts.push(day);
    }
    return starts;
  }
  const mondays: string[] = [];
  for (let day = shiftDay(mondayOf(first), 7); day <= last; day = shiftDay(day, 7)) {
    mondays.push(day);
  }
  return [first, ...mondays];
}

/** The bucket a moment falls in: the last start on or before its day (or its hour). */
export function bucketOf(date: Date, starts: readonly string[]): string | null {
  const day = brazilDay(date);
  const isHourly = (starts[0]?.length ?? 0) > day.length;
  const key = isHourly ? hourKey(day, brazilWeekdayHour(date).hour) : day;
  return starts.findLast((start) => start <= key) ?? null;
}

/** Weekday (Monday = 0) and hour of `date` on the Brasília clock. */
export function brazilWeekdayHour(date: Date): { weekday: number; hour: number } {
  const parts = brazilClock.formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  return { weekday: WEEKDAY_INDEX[weekday] ?? 0, hour };
}

/** The heatmap's hour columns: the support team's working hours. */
export function supportHourColumns(): number[] {
  const { opensAtHour, closesAtHour } = SUPPORT_HOURS;
  return Array.from({ length: closesAtHour - opensAtHour }, (_, index) => opensAtHour + index);
}

export function isSupportHour(hour: number): boolean {
  return hour >= SUPPORT_HOURS.opensAtHour && hour < SUPPORT_HOURS.closesAtHour;
}
