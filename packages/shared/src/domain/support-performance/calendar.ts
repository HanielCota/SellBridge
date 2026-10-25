import { SUPPORT_HOURS } from "../support-hours.ts";
import { DAY_MILLISECONDS } from "../time.ts";
import type { SupportPeriodDays } from "./types.ts";

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

export function bucketKind(days: SupportPeriodDays): "day" | "week" {
  return days === 7 ? "day" : "week";
}

/** Brasília has kept UTC−3 all year since daylight saving ended in 2019. */
const BRAZIL_OFFSET = "-03:00";

/**
 * The period on whole Brasília days: "7 dias" is today and the six days before it, from
 * midnight, so no bucket covers half a day. The previous period is the same length before it.
 */
export function periodBounds(now: Date, days: number): { since: Date; previousSince: Date } {
  const firstDay = shiftDay(brazilDay(now), -(days - 1));
  const since = new Date(`${firstDay}T00:00:00${BRAZIL_OFFSET}`);
  return { since, previousSince: new Date(since.getTime() - days * DAY_MILLISECONDS) };
}

/**
 * Every bucket from `since` to `until`, oldest first. Weeks start on Monday, except the first,
 * which starts on the period's first day, so it never counts days outside the period.
 */
export function bucketStarts(since: Date, until: Date, kind: "day" | "week"): string[] {
  const first = brazilDay(since);
  const last = brazilDay(until);
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

/** The bucket (its first day) a moment falls in: the last start on or before its day. */
export function bucketOf(date: Date, starts: readonly string[]): string | null {
  const day = brazilDay(date);
  return starts.findLast((start) => start <= day) ?? null;
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
