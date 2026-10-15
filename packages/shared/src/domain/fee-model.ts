import {
  computeOrderFinance,
  ESTIMATED_MARKETPLACE_FEE_BPS,
  type OrderFinance,
} from "./finance.ts";
import { validationError } from "../runtime/errors.ts";
import { MAX_STORED_CENTS, percentOfCents, type Cents } from "./money.ts";

/**
 * Everything a sale pays before it becomes profit, as the previews estimate it. The financial
 * report reads the real marketplace fee from each order; the previews read it from here, and
 * both run the same `computeOrderFinance`, so a sale charged what this schedule says ends with
 * the profit the preview promised.
 */
export interface FeeSchedule {
  /** Marketplace commission when the category has no rate of its own, in basis points. */
  marketplaceFeeBasisPoints: number;
  /**
   * Commission per category id, in basis points. Empty until real rates are read from the
   * marketplace (a separate task): no rate here is made up.
   */
  categoryFeeBasisPoints: Readonly<Record<string, number>>;
  /** SellBridge's fee on revenue (`PLATFORM_FEE_BASIS_POINTS`), the same the report charges. */
  platformFeeBasisPoints: number;
  /** Shipping the reseller pays per sale. Zero until the client decides who pays it (D5). */
  estimatedShippingCents: Cents;
  /** Margin a price must keep after every fee, in percent; 0 forbids selling at a loss. */
  minimumMarginPercent: number;
}

export const DEFAULT_FEE_SCHEDULE: FeeSchedule = {
  marketplaceFeeBasisPoints: ESTIMATED_MARKETPLACE_FEE_BPS,
  categoryFeeBasisPoints: {},
  platformFeeBasisPoints: 0,
  estimatedShippingCents: 0,
  minimumMarginPercent: 0,
};

export interface SaleEstimateInput {
  priceCents: Cents;
  costCents: Cents;
  categoryId?: string | null;
}

function marketplaceFeeBasisPointsFor(
  categoryId: string | null | undefined,
  schedule: FeeSchedule,
): number {
  if (categoryId === null || categoryId === undefined) {
    return schedule.marketplaceFeeBasisPoints;
  }
  return schedule.categoryFeeBasisPoints[categoryId] ?? schedule.marketplaceFeeBasisPoints;
}

/**
 * What the marketplace keeps of one sale: its commission on the price plus the shipping the
 * reseller pays. Shipping rides with the fee because the order has one field for both.
 */
// TODO(client:D5): who pays the shipping; until then `estimatedShippingCents` stays 0.
export function estimatedMarketplaceFeeCents(
  input: SaleEstimateInput,
  schedule: FeeSchedule,
): Cents {
  const basisPoints = marketplaceFeeBasisPointsFor(input.categoryId, schedule);
  return percentOfCents(input.priceCents, basisPoints) + schedule.estimatedShippingCents;
}

/** One unit sold at the price, paid and with nothing refunded, by the financial report's rule. */
export function estimateSale(input: SaleEstimateInput, schedule: FeeSchedule): OrderFinance {
  return computeOrderFinance(
    {
      status: "paid",
      totalCents: input.priceCents,
      marketplaceFeeCents: estimatedMarketplaceFeeCents(input, schedule),
      items: [{ quantity: 1, knownUnitCostCents: input.costCents }],
      adjustments: [],
    },
    schedule.platformFeeBasisPoints,
  );
}

function keepsMargin(
  input: SaleEstimateInput,
  marginBasisPoints: number,
  schedule: FeeSchedule,
): boolean {
  const { profitCents } = estimateSale(input, schedule);
  return profitCents * 10_000 >= input.priceCents * marginBasisPoints;
}

/** First price from `start` up that keeps the margin; the caller knows none below `start` does. */
function firstKeepingPrice(start: Cents, keeps: (priceCents: Cents) => boolean): Cents {
  let priceCents = start;
  while (!keeps(priceCents)) {
    priceCents += 1;
  }
  return priceCents;
}

function marginBasisPointsOf(marginPercent: number): number {
  if (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent >= 100) {
    throw validationError("A margem deve ficar entre 0% e 100%");
  }
  return Math.round(marginPercent * 100);
}

/**
 * Smallest price whose estimated profit is at least `marginPercent` of it, after the cost and
 * every fee. Null when the fees and the margin take the whole price, or when the price would
 * pass what a price can be.
 * The two fees round to whole cents, so the profit is off the exact formula by one cent at most
 * and a higher price may even keep less of it: no price under the exact formula's answer with
 * one cent less of cost can keep the margin, so the search starts there and only goes up.
 */
export function priceForMargin(
  input: Omit<SaleEstimateInput, "priceCents">,
  marginPercent: number,
  schedule: FeeSchedule,
): Cents | null {
  const marginBasisPoints = marginBasisPointsOf(marginPercent);
  const keptBasisPoints =
    10_000 -
    marketplaceFeeBasisPointsFor(input.categoryId, schedule) -
    schedule.platformFeeBasisPoints -
    marginBasisPoints;
  if (keptBasisPoints <= 0) {
    return null;
  }
  const fixedCents = input.costCents + schedule.estimatedShippingCents;
  const lowest = Math.max(1, Math.floor(((fixedCents - 1) * 10_000) / keptBasisPoints));
  if (lowest > MAX_STORED_CENTS) {
    return null;
  }
  const priceCents = firstKeepingPrice(lowest, (candidate) =>
    keepsMargin({ ...input, priceCents: candidate }, marginBasisPoints, schedule),
  );
  return priceCents > MAX_STORED_CENTS ? null : priceCents;
}
