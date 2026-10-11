import { ESTIMATED_MARKETPLACE_FEE_BPS } from "@sellbridge/shared/finance";
import { percentOfCents, type Cents } from "@sellbridge/shared/money";

/** The estimated fee as people read it ("14%"). */
export const ESTIMATED_MARKETPLACE_FEE_PERCENT_LABEL = `${ESTIMATED_MARKETPLACE_FEE_BPS / 100}%`;

/** Below this margin a price barely pays for itself and is flagged to the reseller. */
const THIN_MARGIN_PERCENT = 15;

/** At or below this many units (but not zero) a product is about to run out. */
const LOW_STOCK_UNITS = 5;

export function isThinMargin(marginPercent: number): boolean {
  return marginPercent < THIN_MARGIN_PERCENT;
}

export function isLowStock(stock: number): boolean {
  return stock > 0 && stock <= LOW_STOCK_UNITS;
}

export interface ProfitEstimate {
  feeCents: Cents;
  profitCents: Cents;
  marginPercent: number;
}

/**
 * Smallest price whose estimated profit is at least `marginPercent` of it, after the cost and
 * the estimated fee. Null when the fee alone already eats that margin.
 */
export function priceForMargin(costCents: Cents, marginPercent: number): Cents | null {
  const keptBps = 10_000 - ESTIMATED_MARKETPLACE_FEE_BPS - Math.round(marginPercent * 100);
  if (keptBps <= 0) {
    return null;
  }
  return Math.ceil((costCents * 10_000) / keptBps);
}

export function estimateProfit(priceCents: Cents | null, costCents: Cents): ProfitEstimate | null {
  if (priceCents === null || priceCents <= 0) {
    return null;
  }
  const feeCents = percentOfCents(priceCents, ESTIMATED_MARKETPLACE_FEE_BPS);
  const profitCents = priceCents - costCents - feeCents;
  const marginPercent = Math.round((profitCents / priceCents) * 1000) / 10;
  return { feeCents, profitCents, marginPercent };
}
