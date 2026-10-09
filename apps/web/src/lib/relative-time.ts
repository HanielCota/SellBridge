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
