import { MIN_REPORT_YEAR } from "@sellbridge/shared/period-range";

/**
 * Calendar dates are handled as ISO strings (YYYY-MM-DD) and computed in UTC, so the
 * browser's own time zone never shifts a day.
 */
const DAY_MILLISECONDS = 86_400_000;
const DAYS_PER_WEEK = 7;

/**
 * The first day a report covers. Earlier days could be picked, and the server then dropped the
 * range and showed the last 30 days without a word.
 */
export const FIRST_CALENDAR_DAY = `${MIN_REPORT_YEAR}-01-01`;

export function toTime(iso: string): number {
  return Date.parse(`${iso}T00:00:00.000Z`);
}

function fromTime(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromTime(toTime(iso) + days * DAY_MILLISECONDS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toTime(to) - toTime(from)) / DAY_MILLISECONDS);
}

/** First day of the month containing `iso`, shifted by `delta` months. */
export function startOfMonth(iso: string, delta = 0): string {
  const date = new Date(toTime(iso));
  return fromTime(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

/** Same day-of-month `delta` months away, clamped to the target month's length. */
export function addMonths(iso: string, delta: number): string {
  const date = new Date(toTime(iso));
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return fromTime(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), lastDay)),
  );
}

/** Day of the week, 0 for Sunday. */
export function weekdayOf(iso: string): number {
  return new Date(toTime(iso)).getUTCDay();
}

/** The day, kept between the first selectable day and `max`. */
export function clampDay(day: string, max: string): string {
  if (day > max) {
    return max;
  }
  return day < FIRST_CALENDAR_DAY ? FIRST_CALENDAR_DAY : day;
}

/** Weeks of the month, with `null` padding outside it (Apple hides adjacent-month days). */
export function monthWeeks(month: string): (string | null)[][] {
  const first = new Date(toTime(month));
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const leading = Array.from({ length: first.getUTCDay() }, () => null);
  const days = Array.from({ length: daysInMonth }, (_, day) => addDays(month, day));
  const filled = [...leading, ...days];
  const trailing = Array.from(
    { length: (DAYS_PER_WEEK - (filled.length % DAYS_PER_WEEK)) % DAYS_PER_WEEK },
    () => null,
  );
  const cells: (string | null)[] = [...filled, ...trailing];
  return Array.from({ length: cells.length / DAYS_PER_WEEK }, (_, week) =>
    cells.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK),
  );
}
