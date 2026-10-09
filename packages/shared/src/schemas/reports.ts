import { z } from "zod";
import { withFallback, optionalParameter } from "./fallback.ts";

export const PERIOD_PRESETS = ["7d", "30d", "90d", "180d", "custom"] as const;
export const periodPresetSchema = z.enum(PERIOD_PRESETS);
export type PeriodPreset = z.infer<typeof periodPresetSchema>;

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  "180d": "Últimos 6 meses",
  custom: "Personalizado",
};

const PRESET_DAYS: Record<Exclude<PeriodPreset, "custom">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
};

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD");

export const periodSearchSchema = z.object({
  period: withFallback(periodPresetSchema.default("30d"), "30d"),
  from: optionalParameter(isoDateSchema),
  to: optionalParameter(isoDateSchema),
  store: optionalParameter(z.uuid()),
});
export type PeriodSearch = z.infer<typeof periodSearchSchema>;

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

export const ORDER_STATUSES = [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  returned: "Devolvido",
};

export const FINANCIAL_SORTS = ["orderedAt", "revenue", "profit", "status"] as const;
export const financialSortSchema = z.enum(FINANCIAL_SORTS);
export type FinancialSortKey = z.infer<typeof financialSortSchema>;

export const financialSearchSchema = periodSearchSchema.extend({
  status: optionalParameter(orderStatusSchema),
  query: optionalParameter(z.string().trim().max(100)),
  sort: withFallback(financialSortSchema.default("orderedAt"), "orderedAt"),
  direction: withFallback(z.enum(["asc", "desc"]).default("desc"), "desc"),
  page: withFallback(z.coerce.number().int().min(1).default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(10).max(100).default(20), 20),
});
export type FinancialSearch = z.infer<typeof financialSearchSchema>;
