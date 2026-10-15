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

export function formatPointDate(value: string): string {
  return shortDate.format(parseIsoDate(value));
}

const monthShort = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Granularity of a point on the chart: one day, the week starting that day, or a month. */
export type PointGrain = "day" | "week" | "month";

/** Short axis label: "12 de set." for days and weeks, "set." for months. */
export function formatAxisDate(value: string, grain: PointGrain): string {
  return grain === "month" ? monthShort.format(parseIsoDate(value)) : formatPointDate(value);
}

/** Tooltip title: "12 de set.", "Semana de 8 de set.", "setembro de 2026". */
export function formatTooltipDate(value: string, grain: PointGrain): string {
  if (grain === "month") {
    return monthLong.format(parseIsoDate(value));
  }
  if (grain === "week") {
    return `Semana de ${formatPointDate(value)}`;
  }
  return formatPointDate(value);
}
