import type { ReportPeriod } from "@sellbridge/shared/report-period";

/**
 * Pure rules of the "Vendas" page: how the chart groups the days and how the marketplaces
 * split, so every number on screen is checked by a test.
 */

const DAY_MILLISECONDS = 86_400_000;

/** Up to two months the chart shows one bar a day; longer ranges one bar a week. */
export const DAILY_BARS_MAX_DAYS = 62;

export type SalesChartBucket = "day" | "week";

export function periodDays(period: Pick<ReportPeriod, "fromDate" | "toDate">): number {
  const from = Date.parse(`${period.fromDate}T12:00:00Z`);
  const to = Date.parse(`${period.toDate}T12:00:00Z`);
  return Math.round((to - from) / DAY_MILLISECONDS) + 1;
}

export function chartBucketOf(period: Pick<ReportPeriod, "fromDate" | "toDate">): SalesChartBucket {
  return periodDays(period) > DAILY_BARS_MAX_DAYS ? "week" : "day";
}

/** One marketplace's share of the period's orders, as the "Onde você vendeu" bar draws it. */
export interface MarketplaceShare {
  marketplace: string;
  orders: number;
  receivableCents: number;
  /** Whole percent of the orders; the shares always add up to 100 when there are orders. */
  percent: number;
}

/**
 * Whole percents that add up to 100 (largest remainder), so "62% + 37%" never shows next to a
 * bar that is full.
 */
export function marketplaceShares(
  rows: readonly { marketplace: string; orders: number; receivableCents: number }[],
): MarketplaceShare[] {
  const total = rows.reduce((sum, row) => sum + row.orders, 0);
  if (total === 0) {
    return rows.map((row) => ({ ...row, percent: 0 }));
  }
  const exact = rows.map((row) => (row.orders / total) * 100);
  const floors = exact.map((value) => Math.floor(value));
  const missing = 100 - floors.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .toSorted((first, second) => second.remainder - first.remainder)
    .slice(0, missing)
    .map((entry) => entry.index);
  return rows.map((row, index) => ({
    ...row,
    percent: (floors[index] ?? 0) + (byRemainder.includes(index) ? 1 : 0),
  }));
}
