import { percentOfCents, type Cents } from "@sellbridge/shared/money";

/** Typical marketplace commission used only for the estimate shown before publishing. */
export const ESTIMATED_MARKETPLACE_FEE_BPS = 1400;

export interface ProfitEstimate {
  feeCents: Cents;
  profitCents: Cents;
  marginPercent: number | null;
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
