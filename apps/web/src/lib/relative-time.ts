import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";

const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
const absolute = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Largest unit first, with its size in seconds. */
const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3600],
  ["minute", 60],
];

/** "agora", "há 5 minutos", "ontem", "há 3 semanas"… */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const seconds = (date.getTime() - now.getTime()) / 1000;
  const match = UNITS.find(([, size]) => Math.abs(seconds) >= size);
  if (!match) {
    return "agora";
  }
  const [unit, size] = match;
  return relative.format(Math.round(seconds / size), unit);
}

export function formatAbsoluteTime(date: Date): string {
  return absolute.format(date);
}

const RECENT_DAYS = 7;
const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * The one date style of the app: relative within the last week ("há 2 horas", "ontem"),
 * then "9 de out." (with the year when it is not the current one).
 */
export function formatSmartDate(date: Date, now: Date = new Date()): string {
  const ageDays = (now.getTime() - date.getTime()) / 86_400_000;
  if (ageDays >= 0 && ageDays < RECENT_DAYS) {
    return formatRelativeTime(date, now);
  }
  return date.getFullYear() === now.getFullYear()
    ? dayMonth.format(date)
    : dayMonthYear.format(date);
}

const brazilDayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TIME_ZONE });
const DAY_MILLISECONDS = 86_400_000;

/** The calendar day of an instant in Brazil time, as "YYYY-MM-DD". */
export function brazilDayKey(date: Date): string {
  return brazilDayKeyFormat.format(date);
}

/**
 * "Hoje" or "Ontem" for a "YYYY-MM-DD" day in Brazil time, null for any other day: the start of
 * every day heading, which then spells the date in its own style.
 */
export function nearDayName(dayKey: string, now: Date = new Date()): string | null {
  if (dayKey === brazilDayKey(now)) {
    return "Hoje";
  }
  if (dayKey === brazilDayKey(new Date(now.getTime() - DAY_MILLISECONDS))) {
    return "Ontem";
  }
  return null;
}
