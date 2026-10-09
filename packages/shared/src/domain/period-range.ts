import type { PeriodPreset, PeriodSearch } from "../schemas/period.ts";

const PRESET_DAYS: Record<Exclude<PeriodPreset, "custom">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
};

export type TimeBucket = "day" | "week";

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

const DAY_MILLISECONDS = 86_400_000;
const MAX_CUSTOM_DAYS = 366;
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

function startOfBrazilDay(date: Date): Date {
  const parsed = parseIsoDate(toIsoDate(date));
  if (!parsed) {
    throw new Error("Data inválida ao calcular o início do dia");
  }
  return parsed;
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
    bucket: days > 45 ? "week" : "day",
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
