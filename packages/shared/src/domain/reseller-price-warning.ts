import { formatCents } from "./money.ts";

function isPositiveCents(cents: number | null): cents is number {
  return cents !== null && Number.isSafeInteger(cents) && cents > 0;
}

/**
 * The warning shown next to a reseller price above the product's suggested sale price: the
 * reseller would pay more than the product is meant to sell for. It never blocks the import,
 * the supplier may still mean it. Null when there is nothing to warn about or a value is missing.
 *
 * @param resellerPriceCents - What the reseller pays, in cents.
 * @param suggestedPriceCents - The suggested sale price, in cents.
 */
export function resellerPriceAboveSuggestedWarning(
  resellerPriceCents: number | null,
  suggestedPriceCents: number | null,
): string | null {
  if (!isPositiveCents(resellerPriceCents)) {
    return null;
  }
  if (!isPositiveCents(suggestedPriceCents)) {
    return null;
  }
  if (resellerPriceCents <= suggestedPriceCents) {
    return null;
  }
  return `Acima do preço sugerido de ${formatCents(suggestedPriceCents)}: o revendedor teria prejuízo`;
}
