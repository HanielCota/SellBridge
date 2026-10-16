import {
  computeOrderFinance,
  ESTIMATED_MARKETPLACE_FEE_BPS,
  type OrderFinance,
} from "./finance.ts";
import { conflictError, validationError } from "../runtime/errors.ts";
import { LISTING_MAX_PRICE_CENTS } from "../schemas/stores.ts";
import { formatCents, percentOfCents, type Cents } from "./money.ts";

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
 * pass what a listing may charge (`LISTING_MAX_PRICE_CENTS`): a floor no listing can reach is
 * no floor at all, it only told the reseller to ask for a price the server then refuses.
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
  if (lowest > LISTING_MAX_PRICE_CENTS) {
    return null;
  }
  const priceCents = firstKeepingPrice(lowest, (candidate) =>
    keepsMargin({ ...input, priceCents: candidate }, marginBasisPoints, schedule),
  );
  return priceCents > LISTING_MAX_PRICE_CENTS ? null : priceCents;
}

/**
 * Lowest price the reseller may ask: the one that keeps the configured minimum margin after
 * every fee (with 0%, the break-even price), and never the cost itself. Null when the fees
 * take the whole price, so no price pays.
 */
export function minimumPriceCents(
  input: Omit<SaleEstimateInput, "priceCents">,
  schedule: FeeSchedule,
): Cents | null {
  const keepingMargin = priceForMargin(input, schedule.minimumMarginPercent, schedule);
  if (keepingMargin === null) {
    return null;
  }
  return Math.max(keepingMargin, input.costCents + 1);
}

/** What the reseller reads when a price is under the floor: the lowest price that pays. */
function belowMinimumMessage(minimumCents: Cents, schedule: FeeSchedule): string {
  if (schedule.minimumMarginPercent === 0) {
    return `Com as taxas, o preço mínimo para não ter prejuízo é ${formatCents(minimumCents)}`;
  }
  return `Com as taxas, o preço mínimo para ${schedule.minimumMarginPercent}% de margem é ${formatCents(minimumCents)}`;
}

/** When no price can pay: the fees alone, or the fees together with the minimum margin. */
function noPriceMessage(schedule: FeeSchedule): string {
  if (schedule.minimumMarginPercent === 0) {
    return "As taxas configuradas não deixam lucro para este produto";
  }
  return `As taxas e a margem mínima de ${schedule.minimumMarginPercent}% não deixam um preço possível para este produto`;
}

/**
 * Why a price is under the floor, in the words the screens and the server both show; null when
 * the price pays every fee and keeps the minimum margin.
 */
export function priceFloorProblem(
  priceCents: Cents,
  input: Omit<SaleEstimateInput, "priceCents">,
  schedule: FeeSchedule,
): string | null {
  if (priceCents <= input.costCents) {
    return "O preço de venda precisa ser maior que o custo do fornecedor";
  }
  // A markup on a costly product can pass the listing ceiling; the screens say so before the
  // server refuses the batch.
  if (priceCents > LISTING_MAX_PRICE_CENTS) {
    return `O preço de venda pode ser de até ${formatCents(LISTING_MAX_PRICE_CENTS)}`;
  }
  const minimumCents = minimumPriceCents(input, schedule);
  if (minimumCents === null && input.costCents >= LISTING_MAX_PRICE_CENTS) {
    return `O custo do fornecedor já passa do maior preço de um anúncio (${formatCents(LISTING_MAX_PRICE_CENTS)})`;
  }
  if (minimumCents === null) {
    return noPriceMessage(schedule);
  }
  return priceCents < minimumCents ? belowMinimumMessage(minimumCents, schedule) : null;
}

/** The server's floor for every price written: creating and editing a listing. */
export function assertPriceKeepsMargin(
  priceCents: Cents,
  input: Omit<SaleEstimateInput, "priceCents">,
  schedule: FeeSchedule,
): void {
  const problem = priceFloorProblem(priceCents, input, schedule);
  if (problem !== null) {
    throw conflictError(problem);
  }
}

export interface PricedProduct {
  title: string;
  priceCents: Cents;
  costCents: Cents;
  categoryId?: string | null;
}

/** The first product of a batch under its floor, named, so the batch can say which; else null. */
export function batchPriceProblem(
  products: readonly PricedProduct[],
  schedule: FeeSchedule,
): string | null {
  for (const product of products) {
    const problem = priceFloorProblem(product.priceCents, product, schedule);
    if (problem !== null) {
      return `"${product.title}": ${problem}. Ajuste a regra de preço.`;
    }
  }
  return null;
}

/** The bulk publication's floor: the whole batch is refused before anything is written. */
export function assertBatchKeepsMargin(
  products: readonly PricedProduct[],
  schedule: FeeSchedule,
): void {
  const problem = batchPriceProblem(products, schedule);
  if (problem !== null) {
    throw conflictError(problem);
  }
}
