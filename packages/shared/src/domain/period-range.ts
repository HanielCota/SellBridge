import type { PeriodPreset, PeriodSearch } from "../schemas/period.ts";
import { DAY_MILLISECONDS } from "./time.ts";

const PRESET_DAYS: Record<Exclude<PeriodPreset, "custom">, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
};

/** One day reads hour by hour: a single daily bucket would draw a lone dot. */
export type TimeBucket = "hour" | "day" | "week";

export interface ResolvedPeriod {
  /** Inclusive start (00:00 of the first day). */
  from: Date;
  /** Exclusive end (00:00 of the day after the last day). */
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  days: number;
  bucket: TimeBucket;
  /** Calendar dates shown to the user, inclusive. */
  fromDate: string;
  toDate: string;
  /** Calendar dates of the comparison window, inclusive. */
  previousFromDate: string;
  previousToDate: string;
}

/** The longest custom range the reports accept; the date picker reads the same limit. */
export const MAX_CUSTOM_DAYS = 366;
/**
 * Custom ranges stay inside these years. Outside them the comparison window or the exclusive end
 * reaches year 0 or 10000, which the database rejects (an error instead of a report).
 */
export const MIN_REPORT_YEAR = 2000;
export const MAX_REPORT_YEAR = 2100;
/** Brazil (America/Sao_Paulo) has had no DST since 2019: a fixed UTC−3 offset. */
const BRAZIL_OFFSET_MILLISECONDS = 3 * 60 * 60 * 1000;
export const REPORT_TIME_ZONE = "America/Sao_Paulo";

/** Calendar date (YYYY-MM-DD) in Brazil time for an instant. */
function toIsoDate(date: Date): string {
  return new Date(date.getTime() - BRAZIL_OFFSET_MILLISECONDS).toISOString().slice(0, 10);
}

/** Midnight in Brazil time of the given calendar date, or null when invalid. */
function parseIsoDate(value: string): Date | null {
  const utcMidnight = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(utcMidnight.getTime()) || utcMidnight.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return new Date(utcMidnight.getTime() + BRAZIL_OFFSET_MILLISECONDS);
}

/** Midnight, in Brazil time, of the day the instant falls on. */
export function startOfBrazilDay(date: Date): Date {
  const parsed = parseIsoDate(toIsoDate(date));
  if (!parsed) {
    throw new Error("Data inválida ao calcular o início do dia");
  }
  return parsed;
}

/**
 * The previous window cut to the length of the current one already lived. At 09:00 the "7 days"
 * hold six days and nine hours of sales; set against seven whole days, every morning read as a
 * drop. A period already over (or not started) compares whole.
 */
export function comparablePreviousRange(
  period: Pick<ResolvedPeriod, "from" | "to" | "previousFrom" | "previousTo">,
  now: Date,
): { from: Date; to: Date } {
  const lived = Math.min(now.getTime(), period.to.getTime()) - period.from.getTime();
  const whole = period.previousTo.getTime() - period.previousFrom.getTime();
  if (lived <= 0 || lived >= whole) {
    return { from: period.previousFrom, to: period.previousTo };
  }
  return { from: period.previousFrom, to: new Date(period.previousFrom.getTime() + lived) };
}

const HOUR_MILLISECONDS = 60 * 60 * 1000;
/** Fewest hourly buckets the chart draws: one would be a single dot with no line. */
const MIN_CHART_HOURS = 2;

interface TimeRange {
  from: Date;
  to: Date;
}

/**
 * The ranges the chart draws. An hourly chart of today stops at the end of the current hour (the
 * hours still to come would read as a drop to zero) and the day before stops at the same hour, so
 * both lines cover the same stretch. Right after midnight it keeps two hours, so the chart still
 * has a line to draw instead of a lone dot. Every other period draws whole.
 */
export function chartRanges(
  period: Pick<ResolvedPeriod, "from" | "to" | "previousFrom" | "previousTo" | "bucket">,
  now: Date,
): { current: TimeRange; previous: TimeRange } {
  const whole = {
    current: { from: period.from, to: period.to },
    previous: { from: period.previousFrom, to: period.previousTo },
  };
  if (period.bucket !== "hour") {
    return whole;
  }
  // Brazil's offset is whole hours, so a UTC hour boundary is a Brazil one too.
  const endOfHour = (Math.floor(now.getTime() / HOUR_MILLISECONDS) + 1) * HOUR_MILLISECONDS;
  const lived = Math.max(
    MIN_CHART_HOURS * HOUR_MILLISECONDS,
    Math.min(endOfHour, period.to.getTime()) - period.from.getTime(),
  );
  if (lived >= period.to.getTime() - period.from.getTime()) {
    return whole;
  }
  return {
    current: { from: period.from, to: new Date(period.from.getTime() + lived) },
    previous: { from: period.previousFrom, to: new Date(period.previousFrom.getTime() + lived) },
  };
}

function bucketFor(days: number): TimeBucket {
  if (days === 1) {
    return "hour";
  }
  return days > 45 ? "week" : "day";
}

function buildPeriod(firstDay: Date, days: number): ResolvedPeriod {
  const to = new Date(firstDay.getTime() + days * DAY_MILLISECONDS);
  const previousFrom = new Date(firstDay.getTime() - days * DAY_MILLISECONDS);
  return {
    from: firstDay,
    to,
    previousFrom,
    previousTo: firstDay,
    days,
    bucket: bucketFor(days),
    fromDate: toIsoDate(firstDay),
    toDate: toIsoDate(new Date(to.getTime() - DAY_MILLISECONDS)),
    previousFromDate: toIsoDate(previousFrom),
    previousToDate: toIsoDate(new Date(firstDay.getTime() - DAY_MILLISECONDS)),
  };
}

function resolveCustom(from: string | undefined, to: string | undefined): ResolvedPeriod | null {
  if (!from || !to) {
    return null;
  }
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end || end.getTime() < start.getTime()) {
    return null;
  }
  if (Number(from.slice(0, 4)) < MIN_REPORT_YEAR || Number(to.slice(0, 4)) > MAX_REPORT_YEAR) {
    return null;
  }
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MILLISECONDS) + 1;
  if (days > MAX_CUSTOM_DAYS) {
    return null;
  }
  return buildPeriod(start, days);
}

/**
 * Turns the period search params into concrete date ranges (Brazil calendar days) plus
 * the previous period of equal length for comparison. Invalid custom ranges fall back
 * to the last 30 days instead of failing.
 */
export function resolvePeriod(
  search: Pick<PeriodSearch, "period" | "from" | "to">,
  now: Date,
): ResolvedPeriod {
  if (search.period === "custom") {
    const custom = resolveCustom(search.from, search.to);
    if (custom) {
      return custom;
    }
    return resolvePeriod({ period: "30d" }, now);
  }
  const days = PRESET_DAYS[search.period];
  const today = startOfBrazilDay(now);
  return buildPeriod(new Date(today.getTime() - (days - 1) * DAY_MILLISECONDS), days);
}

/** One calendar day of the period as its own range, or null when it is invalid or outside. */
export function dayRangeWithin(
  period: Pick<ResolvedPeriod, "from" | "to">,
  day: string | undefined,
): { from: Date; to: Date } | null {
  if (!day) {
    return null;
  }
  const from = parseIsoDate(day);
  if (!from || from.getTime() < period.from.getTime() || from.getTime() >= period.to.getTime()) {
    return null;
  }
  return { from, to: new Date(from.getTime() + DAY_MILLISECONDS) };
}
