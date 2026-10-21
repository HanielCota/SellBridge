import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";

const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
// Brazil time everywhere: the server renders in UTC, and a 23:30 event must not say tomorrow.
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

/**
 * "agora", "há 5 minutos", "ontem", "há 3 semanas"… Days count calendar days in Brazil time:
 * Monday 21:00 seen on Wednesday 09:00 is "anteontem", not "ontem" (36 hours rounded down).
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const seconds = (date.getTime() - now.getTime()) / 1000;
  const match = UNITS.find(([, size]) => Math.abs(seconds) >= size);
  if (!match) {
    return "agora";
  }
  const [unit, size] = match;
  if (unit === "day") {
    return relative.format(calendarDaysBetween(now, date), unit);
  }
  return relative.format(Math.round(seconds / size), unit);
}

export function formatAbsoluteTime(date: Date): string {
  return absolute.format(date);
}

const clock = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: REPORT_TIME_ZONE,
});
const NEAR_DAY_NAMES: Record<number, string> = { [-1]: "ontem", 0: "hoje", 1: "amanhã" };

/**
 * A deadline to the minute, in Brazil time: "hoje às 14:30", "amanhã às 09:00", "ontem às
 * 18:00", or "17 de out. às 14:30" further away.
 */
export function formatDeadline(date: Date, now: Date = new Date()): string {
  const dayName = NEAR_DAY_NAMES[calendarDaysBetween(now, date)];
  const day = dayName ?? dayMonth.format(date);
  return `${day} às ${clock.format(date)}`;
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

/**
 * The one date style of the app: relative within the last week ("há 2 horas", "ontem"),
 * then "9 de out." (with the year when it is not the current one).
 */
export function formatSmartDate(date: Date, now: Date = new Date()): string {
  const ageDays = (now.getTime() - date.getTime()) / 86_400_000;
  if (ageDays >= 0 && ageDays < RECENT_DAYS) {
    return formatRelativeTime(date, now);
  }
  return brazilDayKey(date).slice(0, 4) === brazilDayKey(now).slice(0, 4)
    ? dayMonth.format(date)
    : dayMonthYear.format(date);
}

const brazilDayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TIME_ZONE });
const DAY_MILLISECONDS = 86_400_000;

/** A "YYYY-MM-DD" key as a UTC midnight, so day arithmetic never meets a clock change. */
function dayKeyTime(dayKey: string): number {
  const [year = 0, month = 1, day = 1] = dayKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Whole calendar days from `from` to `to` in Brazil time (negative when `to` is earlier). */
function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round(
    (dayKeyTime(brazilDayKey(to)) - dayKeyTime(brazilDayKey(from))) / DAY_MILLISECONDS,
  );
}

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
  const yesterday = new Date(dayKeyTime(brazilDayKey(now)) - DAY_MILLISECONDS);
  if (dayKey === yesterday.toISOString().slice(0, 10)) {
    return "Ontem";
  }
  return null;
}
