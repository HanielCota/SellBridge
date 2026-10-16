export interface MetricPoint {
  date: string;
  orders: number;
  revenueCents: number;
  profitCents: number;
  /** Revenue of sales whose cost is unknown: part of `revenueCents`, left out of the profit. */
  pendingCostRevenueCents: number;
}

const shortDate = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const shortDateWithYear = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/** "1 de set. – 30 de set. de 2026", used to say which dates the numbers cover. */
export function formatDateRange(from: string, to: string): string {
  return `${shortDate.format(parseIsoDate(from))} – ${shortDateWithYear.format(parseIsoDate(to))}`;
}

/** Which dates the numbers cover and what they are compared with, under the page title. */
export function formatPeriodCaption(period: { fromDate: string; toDate: string; days: number }) {
  if (period.days === 1) {
    return `${shortDateWithYear.format(parseIsoDate(period.fromDate))} · comparado com o dia anterior`;
  }
  return `${formatDateRange(period.fromDate, period.toDate)} · comparado com os ${period.days} dias anteriores`;
}

export function formatPointDate(value: string): string {
  return shortDate.format(parseIsoDate(value));
}

/**
 * The first day of a bucket that falls inside the period. A weekly bucket is dated by its Monday,
 * so a period starting on a Sunday has a first week dated the Monday before it, a day the reseller
 * never chose.
 */
export function firstDayWithin(bucketDate: string, periodFromDate: string): string {
  return bucketDate < periodFromDate ? periodFromDate : bucketDate;
}

const monthShort = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Granularity of a point on the chart: an hour, a day, the week starting that day, or a month. */
export type PointGrain = "hour" | "day" | "week" | "month";

/** "14h" from an hourly bucket ("2026-10-16T14:00"); the hour is already in Brazil time. */
function formatHour(value: string): string {
  return `${Number(value.slice(11, 13))}h`;
}

/** Short axis label: "14h" for hours, "12 de set." for days and weeks, "set." for months. */
export function formatAxisDate(value: string, grain: PointGrain): string {
  if (grain === "hour") {
    return formatHour(value);
  }
  return grain === "month" ? monthShort.format(parseIsoDate(value)) : formatPointDate(value);
}

/** Tooltip title: "16 de out., 14h", "12 de set.", "Semana de 8 de set.", "setembro de 2026". */
export function formatTooltipDate(value: string, grain: PointGrain): string {
  if (grain === "hour") {
    return `${formatPointDate(value.slice(0, 10))}, ${formatHour(value)}`;
  }
  if (grain === "month") {
    return monthLong.format(parseIsoDate(value));
  }
  if (grain === "week") {
    return `Semana de ${formatPointDate(value)}`;
  }
  return formatPointDate(value);
}
