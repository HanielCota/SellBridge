import { formatCents } from "@sellbridge/shared/money";

export const DASHBOARD_METRICS = ["revenue", "profit", "orders", "averageTicket"] as const;
export type DashboardMetric = (typeof DASHBOARD_METRICS)[number];

export interface MetricPoint {
  date: string;
  orders: number;
  revenueCents: number;
  profitCents: number;
}

interface MetricDefinition {
  label: string;
  /** Formats one value of this metric (money metrics are in cents). */
  format: (value: number) => string;
  /** Short form for the chart's y-axis ticks. */
  formatTick: (value: number) => string;
  /** The value of this metric for one bucket of the time series. */
  valueOf: (point: MetricPoint) => number | null;
}

const compactMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

function formatMoneyTick(cents: number): string {
  return compactMoney.format(cents / 100);
}

export const METRIC_DEFINITIONS: Record<DashboardMetric, MetricDefinition> = {
  revenue: {
    label: "Receita",
    format: formatCents,
    formatTick: formatMoneyTick,
    valueOf: (point) => point.revenueCents,
  },
  profit: {
    label: "Lucro",
    format: formatCents,
    formatTick: formatMoneyTick,
    valueOf: (point) => point.profitCents,
  },
  orders: {
    label: "Vendas",
    format: (value) => integer.format(value),
    formatTick: (value) => integer.format(value),
    valueOf: (point) => point.orders,
  },
  averageTicket: {
    label: "Ticket médio",
    format: formatCents,
    formatTick: formatMoneyTick,
    valueOf: (point) => (point.orders > 0 ? Math.round(point.revenueCents / point.orders) : null),
  },
};

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
