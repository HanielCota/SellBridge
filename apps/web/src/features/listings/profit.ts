import {
  estimateSale,
  type FeeSchedule,
  minimumPriceCents,
  priceForMargin as priceKeepingMargin,
} from "@sellbridge/shared/fee-model";
import type { Cents } from "@sellbridge/shared/money";

/** Below this margin a price barely pays for itself and is flagged to the reseller. */
const THIN_MARGIN_PERCENT = 15;

/** At or below this many units (but not zero) a product is about to run out. */
const LOW_STOCK_UNITS = 5;

const feePercent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** A fee in basis points as people read it: 1400 → "14%", 1250 → "12,5%". */
export function feePercentLabel(basisPoints: number): string {
  return `${feePercent.format(basisPoints / 100)}%`;
}

export function isThinMargin(marginPercent: number): boolean {
  return marginPercent < THIN_MARGIN_PERCENT;
}

/**
 * The margin as a whole percent on screen. Rounded down, never to the nearest: 14.9% rounded
 * read "15%" painted as a thin margin, and a margin is better shown short than inflated.
 */
export function wholeMarginPercent(marginPercent: number): number {
  return Math.floor(marginPercent);
}

export function isLowStock(stock: number): boolean {
  return stock > 0 && stock <= LOW_STOCK_UNITS;
}

export interface ProfitEstimate {
  /** What the marketplace keeps: its commission plus the shipping the reseller pays. */
  feeCents: Cents;
  /** SellBridge's own fee, the one the financial page charges too. */
  platformFeeCents: Cents;
  profitCents: Cents;
  marginPercent: number;
}

/**
 * One sale at the price, by the financial page's own formula (fee-model.ts): the profit a
 * preview promises is the profit the financial page shows for that sale.
 */
export function estimateProfit(
  priceCents: Cents | null,
  costCents: Cents,
  schedule: FeeSchedule,
): ProfitEstimate | null {
  if (priceCents === null || priceCents <= 0) {
    return null;
  }
  const sale = estimateSale({ priceCents, costCents }, schedule);
  return {
    feeCents: sale.feeCents,
    platformFeeCents: sale.platformFeeCents,
    profitCents: sale.profitCents,
    marginPercent: Math.round((sale.profitCents / priceCents) * 1000) / 10,
  };
}

/**
 * Smallest price whose profit is at least `marginPercent` of it after every fee. Null when the
 * fees alone already eat that margin.
 */
export function priceForMargin(
  costCents: Cents,
  marginPercent: number,
  schedule: FeeSchedule,
): Cents | null {
  return priceKeepingMargin({ costCents }, marginPercent, schedule);
}

/** Lowest price the server accepts for the cost: break-even, or the configured minimum margin. */
export function minimumPrice(costCents: Cents, schedule: FeeSchedule): Cents | null {
  return minimumPriceCents({ costCents }, schedule);
}
