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

export interface RowGroup<TRow> {
  key: string;
  rows: TRow[];
}

/**
 * Rows that share a key folded into one group, each group standing where its first row was, so
 * a day's eighteen identical sales read as one line without reshuffling the rest.
 */
export function foldRows<TRow>(
  rows: readonly TRow[],
  keyOf: (row: TRow) => string,
): RowGroup<TRow>[] {
  const groups = new Map<string, TRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) {
      group.push(row);
      continue;
    }
    groups.set(key, [row]);
  }
  return [...groups].map(([key, grouped]) => ({ key, rows: grouped }));
}

export interface DaySplit {
  /** The day started on the previous page. */
  fromPrevious: boolean;
  /** The day goes on on the next page. */
  toNext: boolean;
}

/**
 * Whether the page cut a day in two: it shows fewer of the day's sales than the day had. Sorted
 * by date, only the page's first day can come from the page before and only its last can go on.
 */
export function daySplit({
  salesOnPage,
  salesInDay,
  isFirstDay,
  isLastDay,
  page,
  totalPages,
}: {
  salesOnPage: number;
  salesInDay: number;
  isFirstDay: boolean;
  isLastDay: boolean;
  page: number;
  totalPages: number;
}): DaySplit {
  if (salesOnPage >= salesInDay) {
    return { fromPrevious: false, toNext: false };
  }
  return { fromPrevious: isFirstDay && page > 1, toNext: isLastDay && page < totalPages };
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
