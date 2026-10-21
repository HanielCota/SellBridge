import { LISTING_MAX_PRICE_CENTS } from "@sellbridge/shared/schemas";

export interface CostRange {
  minCost: number | undefined;
  maxCost: number | undefined;
}

function withinCatalog(cents: number | undefined): number | undefined {
  if (cents === undefined) {
    return undefined;
  }
  return Math.min(cents, LISTING_MAX_PRICE_CENTS);
}

/**
 * The cost filter as the URL can hold it: bounds above the catalog ceiling become the ceiling
 * (the URL schema dropped them, so the field showed a filter that was not applied) and swapped
 * bounds are put back in order instead of matching nothing.
 */
export function normalizeCostRange(range: CostRange): CostRange {
  const minCost = withinCatalog(range.minCost);
  const maxCost = withinCatalog(range.maxCost);
  if (minCost !== undefined && maxCost !== undefined && minCost > maxCost) {
    return { minCost: maxCost, maxCost: minCost };
  }
  return { minCost, maxCost };
}
