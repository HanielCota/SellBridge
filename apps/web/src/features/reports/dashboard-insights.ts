import { percentChange } from "@sellbridge/shared/money";

export interface SummaryFigures {
  orders: number;
  revenueCents: number;
  costCents: number;
  feeCents: number;
  refundCents: number;
  commissionCents: number;
  platformFeeCents: number;
  profitCents: number;
}

export type FlowPart = "cost" | "fees" | "refunds" | "profit";

export interface MoneyFlow {
  /** Share of revenue (0–1) for each slice; slices that are zero are left out. */
  parts: { key: FlowPart; share: number; cents: number; perHundred: number }[];
  /** Commissions add to profit, so they are reported apart from the slices. */
  commissionCents: number;
}

/**
 * Splits revenue the same way the database computes profit:
 * revenue − product cost − marketplace fees − platform fee − refunds + commissions.
 * Returns null when there is no revenue or the period ran at a loss (no slice for "profit").
 */
export function buildMoneyFlow(summary: SummaryFigures): MoneyFlow | null {
  if (summary.revenueCents <= 0 || summary.profitCents < 0) {
    return null;
  }
  const slices: { key: FlowPart; cents: number }[] = [
    { key: "cost", cents: summary.costCents },
    { key: "fees", cents: summary.feeCents + summary.platformFeeCents },
    { key: "refunds", cents: summary.refundCents },
    { key: "profit", cents: summary.profitCents },
  ];
  const total = slices.reduce((sum, slice) => sum + slice.cents, 0);
  if (total <= 0) {
    return null;
  }
  const parts = slices
    .filter((slice) => slice.cents > 0)
    .map((slice) => ({ ...slice, share: slice.cents / total }));
  const perHundred = roundToTotal(
    parts.map((part) => part.share * 100),
    100,
  );
  return {
    parts: parts.map((part, index) => ({ ...part, perHundred: perHundred[index] ?? 0 })),
    commissionCents: summary.commissionCents,
  };
}

/**
 * Rounds each value to an integer so the rounded values still add up to `total`
 * (largest remainder method): 48.6 + 14.6 + 0.9 + 35.9 → 49 + 15 + 1 + 35.
 */
export function roundToTotal(values: readonly number[], total: number): number[] {
  const floors = values.map((value) => Math.floor(value));
  let missing = total - floors.reduce((sum, value) => sum + value, 0);
  const byRemainder = values
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .toSorted((first, second) => second.remainder - first.remainder);
  for (const { index } of byRemainder) {
    if (missing <= 0) {
      break;
    }
    floors[index] = (floors[index] ?? 0) + 1;
    missing -= 1;
  }
  return floors;
}

/** The bucket with the highest value, or null when every value is zero or missing. */
export function bestPoint<TPoint extends { date: string }>(
  points: readonly TPoint[],
  valueOf: (point: TPoint) => number | null,
): { date: string; value: number } | null {
  let best: { date: string; value: number } | null = null;
  for (const point of points) {
    const value = valueOf(point);
    if (value !== null && value > 0 && (best === null || value > best.value)) {
      best = { date: point.date, value };
    }
  }
  return best;
}

/** Previous period total spread over the same number of buckets, for a reference line. */
export function previousAverage(previousTotal: number | null, bucketCount: number): number | null {
  if (previousTotal === null || bucketCount === 0) {
    return null;
  }
  return Math.round(previousTotal / bucketCount);
}

/**
 * Above this the previous period had almost no activity, and a percentage stops meaning anything
 * (e.g. +13.188%). The UI says "more than 10×" instead.
 */
const OFF_SCALE_PERCENT = 1000;

const wholePercent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** A rounded percentage change with its sign and thousands separator: "+18.208%", "−12%". */
export function formatPercentChange(percent: number): string {
  const sign = percent > 0 ? "+" : percent < 0 ? "−" : "";
  return `${sign}${wholePercent.format(Math.abs(percent))}%`;
}

export type Trend = {
  direction: "up" | "down" | "flat";
  percent: number;
  isOffScale: boolean;
} | null;

export function trendOf(current: number | null, previous: number | null): Trend {
  if (current === null || previous === null) {
    return null;
  }
  const change = percentChange(current, previous);
  if (change === null) {
    return null;
  }
  if (change === 0) {
    return { direction: "flat", percent: 0, isOffScale: false };
  }
  const percent = Math.abs(change);
  return {
    direction: change > 0 ? "up" : "down",
    percent,
    isOffScale: percent >= OFF_SCALE_PERCENT,
  };
}

export type RevenueStory =
  | { kind: "no-baseline" }
  | { kind: "flat" }
  /** Signed, rounded percentages; `ticket` is null when the current period has no orders. */
  | { kind: "change"; revenue: number; orders: number; ticket: number | null };

/**
 * Explains a revenue change by its two levers (how many orders and how much each one was
 * worth), so the dashboard can say why revenue moved, not just repeat the percentage.
 */
export function explainRevenue(
  current: { revenueCents: number; orders: number },
  previous: { revenueCents: number; orders: number },
): RevenueStory {
  if (previous.revenueCents <= 0 || previous.orders <= 0) {
    return { kind: "no-baseline" };
  }
  const revenue = Math.round(
    ((current.revenueCents - previous.revenueCents) / previous.revenueCents) * 100,
  );
  if (revenue === 0) {
    return { kind: "flat" };
  }
  const orders = Math.round(((current.orders - previous.orders) / previous.orders) * 100);
  const previousTicket = previous.revenueCents / previous.orders;
  const ticket =
    current.orders > 0
      ? Math.round(
          ((current.revenueCents / current.orders - previousTicket) / previousTicket) * 100,
        )
      : null;
  return { kind: "change", revenue, orders, ticket };
}
