import type { FeeSchedule } from "@sellbridge/shared/fee-model";
import { type PriceRule, priceForRule } from "@sellbridge/shared/schemas";
import {
  type ProductCost,
  type SaleChannels,
  shelfPriceForMargin,
} from "@/features/listings/profit";

/** What a bulk publication needs to price one product. */
export type BulkPricedProduct = ProductCost & { suggestedPriceCents: number };

/**
 * The price a bulk publication gives a product under a rule, in cents. A profit margin is
 * priced like the "Margem 30%" shortcut of one listing: the lowest price ending in ,90 that
 * leaves that share of the price after every fee. Null when the fees alone already take it.
 */
export function bulkPriceCents(
  product: BulkPricedProduct,
  rule: PriceRule,
  schedule: FeeSchedule,
  channels: SaleChannels,
): number | null {
  if (rule.kind === "margin") {
    return shelfPriceForMargin(product, rule.percent, schedule, channels);
  }
  return priceForRule(product, rule);
}

/** Said when no price leaves the asked margin, so the reseller knows what to change. */
export function unreachableMarginMessage(title: string, percent: number): string {
  return `As taxas não deixam ${percent}% de lucro em "${title}". Escolha uma margem menor.`;
}
