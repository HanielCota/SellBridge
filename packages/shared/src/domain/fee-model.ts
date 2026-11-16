import {
  channelFeeSegments,
  channelSaleFees,
  FEE_CHANNEL_OWNERS,
  type ChannelFeeContext,
  type ChannelSaleFees,
  type FeeChannel,
  totalChannelFeeCents,
} from "./channel-fees.ts";
import {
  computeOrderFinance,
  ESTIMATED_MARKETPLACE_FEE_BPS,
  type OrderFinance,
} from "./finance.ts";
import { conflictError, validationError } from "../runtime/errors.ts";
import { LISTING_MAX_PRICE_CENTS } from "../schemas/stores.ts";
import { formatCents, type Cents } from "./money.ts";

/**
 * Everything a sale pays before it becomes profit, as the previews estimate it, on one channel.
 * The financial report reads the real marketplace fee from each order; the previews read the
 * channel's published fees (channel-fees.ts), and both run the same `computeOrderFinance`, so a
 * sale charged what this schedule says ends with the profit the preview promised.
 */
export interface FeeSchedule {
  /** The marketplace the sale happens on; each one charges its own way. */
  channel: FeeChannel;
  /** Mercado Livre's commission when the category has no rate of its own, in basis points. */
  marketplaceFeeBasisPoints: number;
  /**
   * Mercado Livre commission per category id, in basis points. Empty until real rates are read
   * from the marketplace: no rate here is made up.
   */
  categoryFeeBasisPoints: Readonly<Record<string, number>>;
  /** SellBridge's fee on revenue (`PLATFORM_FEE_BASIS_POINTS`), the same the report charges. */
  platformFeeBasisPoints: number;
  /** Weight the shipping is priced on when the product has none, in grams. */
  defaultWeightGrams: number;
  /** Margin a price must keep after every fee, in percent; 0 forbids selling at a loss. */
  minimumMarginPercent: number;
}

/** Up to 0,5 kg: the shipping estimate for a product whose weight nobody gave. */
export const DEFAULT_PRODUCT_WEIGHT_GRAMS = 500;

export const DEFAULT_FEE_SCHEDULE: FeeSchedule = {
  channel: "mercado_livre",
  marketplaceFeeBasisPoints: ESTIMATED_MARKETPLACE_FEE_BPS,
  categoryFeeBasisPoints: {},
  platformFeeBasisPoints: 0,
  defaultWeightGrams: DEFAULT_PRODUCT_WEIGHT_GRAMS,
  minimumMarginPercent: 0,
};

/** The same fees and limits, on another channel. */
export function onChannel(schedule: FeeSchedule, channel: FeeChannel): FeeSchedule {
  return { ...schedule, channel };
}

export interface SaleEstimateInput {
  priceCents: Cents;
  costCents: Cents;
  categoryId?: string | null;
  /** The product's weight in grams; null or absent uses the schedule's default. */
  weightGrams?: number | null;
}

type ProductFeeInput = Omit<SaleEstimateInput, "priceCents">;

function mercadoLivreCommissionFor(
  categoryId: string | null | undefined,
  schedule: FeeSchedule,
): number {
  if (categoryId === null || categoryId === undefined) {
    return schedule.marketplaceFeeBasisPoints;
  }
  return schedule.categoryFeeBasisPoints[categoryId] ?? schedule.marketplaceFeeBasisPoints;
}

function weightOf(input: ProductFeeInput, schedule: FeeSchedule): number {
  const weightGrams = input.weightGrams;
  if (weightGrams === null || weightGrams === undefined || weightGrams <= 0) {
    return schedule.defaultWeightGrams;
  }
  return weightGrams;
}

function feeContextOf(input: ProductFeeInput, schedule: FeeSchedule): ChannelFeeContext {
  return {
    mercadoLivreCommissionBasisPoints: mercadoLivreCommissionFor(input.categoryId, schedule),
    weightGrams: weightOf(input, schedule),
  };
}

/** What the marketplace keeps of one sale, line by line: commission, fixed fee and shipping. */
export function estimateSaleFees(input: SaleEstimateInput, schedule: FeeSchedule): ChannelSaleFees {
  return channelSaleFees(schedule.channel, input.priceCents, feeContextOf(input, schedule));
}

/**
 * What the marketplace keeps of one sale in total. Shipping rides with the fee because the order
 * has one field for both.
 */
export function estimatedMarketplaceFeeCents(
  input: SaleEstimateInput,
  schedule: FeeSchedule,
): Cents {
  return totalChannelFeeCents(estimateSaleFees(input, schedule));
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

function marginBasisPointsOf(marginPercent: number): number {
  if (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent >= 100) {
    throw validationError("A margem deve ficar entre 0% e 100%");
  }
  return Math.round(marginPercent * 100);
}

/**
 * Cents the rounded fees may sit under their exact formula: the commission, a percentage
 * shipping or a half-price cap, and SellBridge's fee each round to the nearest cent.
 */
const ROUNDING_SLACK_CENTS = 2;

/**
 * Smallest price whose estimated profit is at least `marginPercent` of it, after the cost and
 * every fee of the channel. Null when the fees and the margin take the whole price, or when the
 * price would pass what a listing may charge (`LISTING_MAX_PRICE_CENTS`): a floor no listing can
 * reach is no floor at all, it only told the reseller to ask for a price the server then refuses.
 * The channel's fees are straight lines over price ranges (a shipping band, a commission tier),
 * and a higher range can cost more than the profit it adds (R$ 79,00 pays more shipping on
 * Mercado Livre than R$ 78,99), so each range is solved in turn, cheapest first. Inside a range
 * the search starts under the exact formula's answer by the rounding slack and only goes up.
 */
export function priceForMargin(
  input: ProductFeeInput,
  marginPercent: number,
  schedule: FeeSchedule,
): Cents | null {
  const marginBasisPoints = marginBasisPointsOf(marginPercent);
  const segments = channelFeeSegments(schedule.channel, feeContextOf(input, schedule));
  for (const segment of segments) {
    if (segment.fromCents > LISTING_MAX_PRICE_CENTS) {
      return null;
    }
    const keptBasisPoints =
      10_000 - segment.basisPoints - schedule.platformFeeBasisPoints - marginBasisPoints;
    if (keptBasisPoints <= 0) {
      continue;
    }
    const fixedCents = input.costCents + segment.fixedCents - ROUNDING_SLACK_CENTS;
    const formulaCents = Math.floor((fixedCents * 10_000) / keptBasisPoints);
    const lastCents = Math.min(segment.toCents, LISTING_MAX_PRICE_CENTS);
    for (
      let priceCents = Math.max(1, segment.fromCents, formulaCents);
      priceCents <= lastCents;
      priceCents += 1
    ) {
      if (keepsMargin({ ...input, priceCents }, marginBasisPoints, schedule)) {
        return priceCents;
      }
    }
  }
  return null;
}

/**
 * Lowest price the reseller may ask: the one that keeps the configured minimum margin after
 * every fee (with 0%, the break-even price), and never the cost itself. Null when the fees
 * take the whole price, so no price pays.
 */
export function minimumPriceCents(input: ProductFeeInput, schedule: FeeSchedule): Cents | null {
  const keepingMargin = priceForMargin(input, schedule.minimumMarginPercent, schedule);
  if (keepingMargin === null) {
    return null;
  }
  return Math.max(keepingMargin, input.costCents + 1);
}

/** What the reseller reads when a price is under the floor: the lowest price that pays. */
function belowMinimumMessage(minimumCents: Cents, schedule: FeeSchedule): string {
  const owner = FEE_CHANNEL_OWNERS[schedule.channel];
  if (schedule.minimumMarginPercent === 0) {
    return `Com as taxas ${owner}, o preço mínimo para não ter prejuízo é ${formatCents(minimumCents)}`;
  }
  return `Com as taxas ${owner}, o preço mínimo para ${schedule.minimumMarginPercent}% de margem é ${formatCents(minimumCents)}`;
}

/** When no price can pay: the fees alone, or the fees together with the minimum margin. */
function noPriceMessage(schedule: FeeSchedule): string {
  const owner = FEE_CHANNEL_OWNERS[schedule.channel];
  if (schedule.minimumMarginPercent === 0) {
    return `As taxas ${owner} não deixam lucro para este produto`;
  }
  return `As taxas ${owner} e a margem mínima de ${schedule.minimumMarginPercent}% não deixam um preço possível para este produto`;
}

/**
 * Why a price is under the floor, in the words the screens and the server both show; null when
 * the price pays every fee and keeps the minimum margin.
 */
export function priceFloorProblem(
  priceCents: Cents,
  input: ProductFeeInput,
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

/** The floor on every channel the price will sell on: the first channel it does not pay on. */
export function priceFloorProblemOnChannels(
  priceCents: Cents,
  input: ProductFeeInput,
  schedule: FeeSchedule,
  channels: readonly FeeChannel[],
): string | null {
  for (const channel of new Set(channels)) {
    const problem = priceFloorProblem(priceCents, input, onChannel(schedule, channel));
    if (problem !== null) {
      return problem;
    }
  }
  return null;
}

/** The server's floor for every price written: creating and editing a listing, on its channels. */
export function assertPriceKeepsMargin(
  priceCents: Cents,
  input: ProductFeeInput,
  schedule: FeeSchedule,
  channels: readonly FeeChannel[] = [schedule.channel],
): void {
  const problem = priceFloorProblemOnChannels(priceCents, input, schedule, channels);
  if (problem !== null) {
    throw conflictError(problem);
  }
}

export interface PricedProduct {
  title: string;
  priceCents: Cents;
  costCents: Cents;
  categoryId?: string | null;
  weightGrams?: number | null;
}

/** The first product of a batch under its floor on some channel, named; else null. */
export function batchPriceProblem(
  products: readonly PricedProduct[],
  schedule: FeeSchedule,
  channels: readonly FeeChannel[] = [schedule.channel],
): string | null {
  for (const product of products) {
    const problem = priceFloorProblemOnChannels(product.priceCents, product, schedule, channels);
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
  channels: readonly FeeChannel[] = [schedule.channel],
): void {
  const problem = batchPriceProblem(products, schedule, channels);
  if (problem !== null) {
    throw conflictError(problem);
  }
}
