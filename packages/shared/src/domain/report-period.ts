import type { ReportPeriodSearch } from "../schemas/report-period.ts";
import { MIN_REPORT_YEAR, resolvePeriod, startOfBrazilDay } from "./period-range.ts";
import { DAY_MILLISECONDS } from "./time.ts";

/** Brazil (America/Sao_Paulo) has had no DST since 2019: a fixed UTC−3 offset. */
const BRAZIL_OFFSET_MILLISECONDS = 3 * 60 * 60 * 1000;
/** Months of the "month by month" chart, the current one included. */
export const TREND_MONTHS = 6;

export type ReportPeriodKind = "month" | "range";
/** A closed period never changes again; a partial one still gets new data until it ends. */
export type ReportPeriodStatus = "closed" | "partial";

export interface ReportRange {
  /** Inclusive start (00:00 in Brazil). */
  from: Date;
  /** Exclusive end. */
  to: Date;
}

export interface ReportPeriod extends ReportRange {
  kind: ReportPeriodKind;
  /** `YYYY-MM` in month mode, null for a range. */
  month: string | null;
  status: ReportPeriodStatus;
  /** Calendar days shown to the user, inclusive (a partial month ends today). */
  fromDate: string;
  toDate: string;
  days: number;
  /** The window it is compared with: the month before, cut to the same lived days when partial. */
  previous: ReportRange & { fromDate: string; toDate: string; month: string | null };
}

const monthNameFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

function toIsoDate(date: Date): string {
  return new Date(date.getTime() - BRAZIL_OFFSET_MILLISECONDS).toISOString().slice(0, 10);
}

function brazilMidnight(isoDate: string): Date {
  return new Date(new Date(`${isoDate}T00:00:00.000Z`).getTime() + BRAZIL_OFFSET_MILLISECONDS);
}

function lastDayBefore(exclusiveEnd: Date): string {
  return toIsoDate(new Date(exclusiveEnd.getTime() - DAY_MILLISECONDS));
}

/** The calendar day (`YYYY-MM-DD`) of an instant, in Brazil time. */
export function brazilDateOf(now: Date): string {
  return toIsoDate(now);
}

/** The month (`YYYY-MM`) of an instant, in Brazil time. */
export function brazilMonthOf(now: Date): string {
  return toIsoDate(now).slice(0, 7);
}

/** The month `delta` months away: `shiftMonth("2026-01", -1)` is `"2025-12"`. */
export function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1 + delta;
  const shifted = new Date(Date.UTC(year, monthIndex, 1));
  return shifted.toISOString().slice(0, 7);
}

/** "Outubro de 2026". */
export function monthLabel(month: string): string {
  const name = monthNameFormatter.format(new Date(`${month}-01T12:00:00.000Z`));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${month.slice(0, 4)}`;
}

/** The whole calendar month as a range (00:00 of day 1 to 00:00 of the next month). */
export function monthRange(month: string): ReportRange {
  return { from: brazilMidnight(`${month}-01`), to: brazilMidnight(`${shiftMonth(month, 1)}-01`) };
}

function clampMonth(month: string | undefined, currentMonth: string): string {
  if (month === undefined || month > currentMonth || Number(month.slice(0, 4)) < MIN_REPORT_YEAR) {
    return currentMonth;
  }
  return month;
}

/** The previous month cut to as many days as the current one has lived, so both compare fairly. */
function previousOfMonth(month: string, livedMilliseconds: number) {
  const previousMonth = shiftMonth(month, -1);
  const whole = monthRange(previousMonth);
  const to = new Date(Math.min(whole.to.getTime(), whole.from.getTime() + livedMilliseconds));
  return {
    from: whole.from,
    to,
    fromDate: toIsoDate(whole.from),
    toDate: lastDayBefore(to),
    month: previousMonth,
  };
}

function resolveMonth(month: string, now: Date): ReportPeriod {
  const whole = monthRange(month);
  const tomorrow = new Date(startOfBrazilDay(now).getTime() + DAY_MILLISECONDS);
  const to = new Date(Math.min(whole.to.getTime(), tomorrow.getTime()));
  const status: ReportPeriodStatus = to.getTime() < whole.to.getTime() ? "partial" : "closed";
  const lived = to.getTime() - whole.from.getTime();
  return {
    kind: "month",
    month,
    status,
    from: whole.from,
    to,
    fromDate: toIsoDate(whole.from),
    toDate: lastDayBefore(to),
    days: Math.round(lived / DAY_MILLISECONDS),
    previous: previousOfMonth(month, status === "partial" ? lived : Number.POSITIVE_INFINITY),
  };
}

/** A range that starts on day 1 and ends on the last day of the same month reads as that month. */
function wholeMonthOf(fromDate: string, toDate: string): string | null {
  const month = fromDate.slice(0, 7);
  if (!fromDate.endsWith("-01") || toDate !== lastDayBefore(monthRange(month).to)) {
    return null;
  }
  return month;
}

function resolveRange(fromDate: string, toDate: string, now: Date): ReportPeriod | null {
  const today = toIsoDate(now);
  const cappedTo = toDate > today ? today : toDate;
  if (fromDate > cappedTo) {
    return null;
  }
  const wholeMonth = wholeMonthOf(fromDate, toDate);
  if (wholeMonth !== null) {
    return resolveMonth(wholeMonth, now);
  }
  const resolved = resolvePeriod({ period: "custom", from: fromDate, to: cappedTo }, now);
  if (resolved.fromDate !== fromDate) {
    return null;
  }
  return {
    kind: "range",
    month: null,
    status: resolved.to.getTime() > now.getTime() ? "partial" : "closed",
    from: resolved.from,
    to: resolved.to,
    fromDate: resolved.fromDate,
    toDate: resolved.toDate,
    days: resolved.days,
    previous: {
      from: resolved.previousFrom,
      to: resolved.previousTo,
      fromDate: resolved.previousFromDate,
      toDate: resolved.previousToDate,
      month: null,
    },
  };
}

/**
 * Turns the report's search params into the period it covers, in Brazil calendar days. A range
 * that is a whole month goes back to month mode; a month in the future, an invalid range or none
 * at all fall back to the current month.
 */
export function resolveReportPeriod(search: ReportPeriodSearch, now: Date): ReportPeriod {
  const currentMonth = brazilMonthOf(now);
  if (search.de !== undefined && search.ate !== undefined) {
    const range = resolveRange(search.de, search.ate, now);
    if (range !== null) {
      return range;
    }
  }
  return resolveMonth(clampMonth(search.mes, currentMonth), now);
}

/** The months of the trend chart, oldest first, ending at the period's month (or its last day). */
export function trendMonths(period: Pick<ReportPeriod, "toDate">): string[] {
  const lastMonth = period.toDate.slice(0, 7);
  return Array.from({ length: TREND_MONTHS }, (_, index) =>
    shiftMonth(lastMonth, index - TREND_MONTHS + 1),
  );
}

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

/** "01/10 a 15/10" for a range, "Outubro de 2026" for a month. */
export function reportPeriodLabel(
  period: Pick<ReportPeriod, "kind" | "month" | "fromDate" | "toDate">,
) {
  if (period.kind === "month" && period.month !== null) {
    return monthLabel(period.month);
  }
  const from = shortDateFormatter.format(new Date(`${period.fromDate}T12:00:00.000Z`));
  const to = shortDateFormatter.format(new Date(`${period.toDate}T12:00:00.000Z`));
  return `${from} a ${to}`;
}

/** The search params that select this period again (for links and downloads). */
export function reportPeriodSearchOf(
  period: Pick<ReportPeriod, "kind" | "month" | "fromDate" | "toDate">,
) {
  if (period.kind === "month" && period.month !== null) {
    return { mes: period.month };
  }
  return { de: period.fromDate, ate: period.toDate };
}
