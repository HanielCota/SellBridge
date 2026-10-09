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
export const OFF_SCALE_PERCENT = 1000;

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

/** Profit as a share of revenue (0–1), or null without revenue. */
export function marginOf(
  summary: Pick<SummaryFigures, "profitCents" | "revenueCents">,
): number | null {
  return summary.revenueCents > 0 ? summary.profitCents / summary.revenueCents : null;
}
