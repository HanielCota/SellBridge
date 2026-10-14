import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";

const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
// Pinned to São Paulo: the server renders in UTC, and a 22:30 sale must not read as the next day.
const absolute = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: REPORT_TIME_ZONE,
});

/** Largest unit first, with its size in seconds. */
const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3600],
  ["minute", 60],
];

const calendarDay = new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TIME_ZONE });

/** Midnight (as a UTC instant) of the São Paulo calendar day `value` falls on. */
function calendarDayStart(value: Date): number {
  return Date.parse(`${calendarDay.format(value)}T00:00:00Z`);
}

/** Whole calendar days from `now` to `date` in São Paulo (negative in the past). */
function calendarDaysBetween(date: Date, now: Date): number {
  return Math.round((calendarDayStart(date) - calendarDayStart(now)) / 86_400_000);
}

/**
 * "agora", "há 5 minutos", "ontem", "há 3 semanas"… Days are calendar days in São Paulo, not
 * blocks of 24 hours: a sale on Monday at 10:00 is "ontem" all Tuesday, even at 23:00.
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const seconds = (date.getTime() - now.getTime()) / 1000;
  const match = UNITS.find(([, size]) => Math.abs(seconds) >= size);
  if (!match) {
    return "agora";
  }
  const [unit, size] = match;
  if (unit === "day") return relative.format(calendarDaysBetween(date, now), "day");
  return relative.format(Math.round(seconds / size), unit);
}

export function formatAbsoluteTime(date: Date): string {
  return absolute.format(date);
}

const RECENT_DAYS = 7;
const dayMonth = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  timeZone: REPORT_TIME_ZONE,
});
const dayMonthYear = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: REPORT_TIME_ZONE,
});
const yearOnly = new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: REPORT_TIME_ZONE });

/**
 * The one date style of the app: relative within the last week ("há 2 horas", "ontem"),
 * then "9 de out." (with the year when it is not the current one).
 */
export function formatSmartDate(date: Date, now: Date = new Date()): string {
  const ageDays = (now.getTime() - date.getTime()) / 86_400_000;
  if (ageDays >= 0 && ageDays < RECENT_DAYS) {
    return formatRelativeTime(date, now);
  }
  return yearOnly.format(date) === yearOnly.format(now)
    ? dayMonth.format(date)
    : dayMonthYear.format(date);
}
