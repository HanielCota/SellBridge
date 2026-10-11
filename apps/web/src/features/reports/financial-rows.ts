import type { OrderFinancialRow } from "@sellbridge/database/repositories";
import type { Cents } from "@sellbridge/shared/money";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";

type OrderCosts = Pick<OrderFinancialRow, "costCents" | "feeCents" | "platformFeeCents">;
type OrderMoneyFlows = Pick<OrderFinancialRow, "commissionCents" | "refundCents" | "returnCents">;

/** What an order cost the reseller (products plus every fee), as a negative amount. */
export function orderCostsCents(row: OrderCosts): Cents {
  const total = row.costCents + row.feeCents + row.platformFeeCents;
  return total === 0 ? 0 : -total;
}

export type OrderAdjustmentKind = "commission" | "refund" | "return";

export interface OrderAdjustment {
  kind: OrderAdjustmentKind;
  cents: Cents;
}

/**
 * Money that moved after the sale, in display order. Empty when commissions and refunds
 * cancel out and nothing came back, so the cell shows a dash instead of noise.
 */
export function orderAdjustments(row: OrderMoneyFlows): readonly OrderAdjustment[] {
  if (row.commissionCents - row.refundCents === 0 && row.returnCents === 0) {
    return [];
  }
  const adjustments: OrderAdjustment[] = [
    { kind: "commission", cents: row.commissionCents },
    { kind: "refund", cents: row.refundCents },
    { kind: "return", cents: row.returnCents },
  ];
  return adjustments.filter((adjustment) => adjustment.cents > 0);
}

type OrderSplitInput = OrderCosts & Pick<OrderFinancialRow, "refundCents" | "profitCents">;

export type OrderSplitKind = "cost" | "fee" | "refund" | "profit";

export interface OrderSplitPart {
  kind: OrderSplitKind;
  cents: Cents;
}

/**
 * Where an order's money went, in the summary's order: products, fees, refunds and what was
 * left. Empty parts are dropped; a loss keeps only the outflows.
 */
export function orderSplit(row: OrderSplitInput): readonly OrderSplitPart[] {
  const parts: OrderSplitPart[] = [
    { kind: "cost", cents: row.costCents },
    { kind: "fee", cents: row.feeCents + row.platformFeeCents },
    { kind: "refund", cents: row.refundCents },
    { kind: "profit", cents: Math.max(row.profitCents, 0) },
  ];
  return parts.filter((part) => part.cents > 0);
}

/** Profit over revenue, or null when nothing was sold (a cancelled or returned order). */
export function orderMargin(row: Pick<OrderFinancialRow, "revenueCents" | "profitCents">) {
  if (row.revenueCents <= 0) {
    return null;
  }
  return row.profitCents / row.revenueCents;
}

/**
 * Splits 100 among the parts in proportion, as whole numbers that still add up to 100: the
 * leftover units go to the parts that lost the most in the rounding. All zeros when empty.
 */
export function perHundred(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return values.map(() => 0);
  }
  const exact = values.map((value) => (value / total) * 100);
  const floors = exact.map((share) => Math.floor(share));
  const leftover = 100 - floors.reduce((sum, share) => sum + share, 0);
  const winners = new Set(
    exact
      .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
      .toSorted((first, second) => second.fraction - first.fraction)
      .slice(0, leftover)
      .map((entry) => entry.index),
  );
  return floors.map((share, index) => (winners.has(index) ? share + 1 : share));
}

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TIME_ZONE });

/** The calendar day of an instant in Brazil time, as "YYYY-MM-DD" (the timeseries' keys). */
export function reportDayKey(date: Date): string {
  return dayKeyFormat.format(date);
}

export interface OrderDay<TRow> {
  key: string;
  rows: TRow[];
}

/** Consecutive rows of the same day together, keeping the list's order (newest or oldest first). */
export function groupOrdersByDay<TRow extends { orderedAt: Date }>(
  rows: readonly TRow[],
): OrderDay<TRow>[] {
  return rows.reduce<OrderDay<TRow>[]>((days, row) => {
    const key = reportDayKey(row.orderedAt);
    const last = days.at(-1);
    if (last?.key === key) {
      last.rows.push(row);
      return days;
    }
    days.push({ key, rows: [row] });
    return days;
  }, []);
}

const weekdayFormat = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const weekdayWithYearFormat = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const DAY_MILLISECONDS = 86_400_000;

/** A day's heading in the statement: "Hoje", "Ontem", then "Quarta-feira, 8 de out.". */
export function formatDayHeading(key: string, now: Date = new Date()): string {
  const today = reportDayKey(now);
  if (key === today) {
    return "Hoje";
  }
  if (key === reportDayKey(new Date(now.getTime() - DAY_MILLISECONDS))) {
    return "Ontem";
  }
  const date = new Date(`${key}T12:00:00Z`);
  const format = key.slice(0, 4) === today.slice(0, 4) ? weekdayFormat : weekdayWithYearFormat;
  const label = format.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
