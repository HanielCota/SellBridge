import { type FeeChannel, feeChannelOf } from "@sellbridge/shared/channel-fees";
import {
  estimateSale,
  type FeeSchedule,
  type MercadoLivreStoreRates,
  minimumPriceCents,
  onChannel,
  priceForMargin as priceKeepingMargin,
} from "@sellbridge/shared/fee-model";
import type { Cents } from "@sellbridge/shared/money";
import { LISTING_MAX_PRICE_CENTS } from "@sellbridge/shared/schemas";

/** Below this margin a price barely pays for itself and is flagged to the reseller. */
const THIN_MARGIN_PERCENT = 15;

/** At or below this many units (but not zero) a product is about to run out. */
const LOW_STOCK_UNITS = 5;

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

/**
 * The margin in the catalog's words: a negative one is a loss and is called one, never "margem
 * -2%", which read like a thin margin (partners' report of 23/11/2026).
 */
export function marginWords(marginPercent: number): { text: string; loss: boolean } {
  if (marginPercent < 0) {
    return { text: "prejuízo", loss: true };
  }
  return { text: `margem ${wholeMarginPercent(marginPercent)}%`, loss: false };
}

export function isLowStock(stock: number): boolean {
  return stock > 0 && stock <= LOW_STOCK_UNITS;
}

/** The marketplaces a price sells on; never empty. */
export type SaleChannels = readonly [FeeChannel, ...FeeChannel[]];

/** With no store chosen yet, prices are shown as Mercado Livre charges them. */
export const DEFAULT_SALE_CHANNELS: SaleChannels = ["mercado_livre"];

/** The channels of the stores a price sells on, each once; Mercado Livre when there is none. */
export function saleChannelsOf(stores: readonly { marketplace: string }[]): SaleChannels {
  const [first, ...rest] = [...new Set(stores.map((store) => feeChannelOf(store.marketplace)))];
  return first === undefined ? DEFAULT_SALE_CHANNELS : [first, ...rest];
}

/** What a price is checked against: the supplier's cost and the weight shipping is priced on. */
export interface ProductCost {
  costCents: Cents;
  weightGrams?: number | null;
  /** Mercado Livre's own numbers on the chosen stores; absent prices on the estimate. */
  mercadoLivreRates?: MercadoLivreStoreRates | null;
}

export interface ProfitEstimate {
  /** The channel the estimate is for: of several, the one that leaves the least. */
  channel: FeeChannel;
  /** What the marketplace keeps: its commission, fixed fee and the shipping the seller pays. */
  feeCents: Cents;
  profitCents: Cents;
  marginPercent: number;
}

function estimateOn(
  priceCents: Cents,
  product: ProductCost,
  schedule: FeeSchedule,
  channel: FeeChannel,
): ProfitEstimate {
  const sale = estimateSale(
    {
      priceCents,
      costCents: product.costCents,
      weightGrams: product.weightGrams ?? null,
      mercadoLivreRates: product.mercadoLivreRates ?? null,
    },
    onChannel(schedule, channel),
  );
  return {
    channel,
    feeCents: sale.feeCents,
    profitCents: sale.profitCents,
    marginPercent: Math.round((sale.profitCents / priceCents) * 1000) / 10,
  };
}

/**
 * One sale at the price, by the financial page's own formula (fee-model.ts): the profit a
 * preview promises is the profit the financial page shows for that sale. Sold on several
 * channels, the estimate is the one that leaves the least, so no store does worse than shown.
 */
export function estimateProfit(
  priceCents: Cents | null,
  product: ProductCost,
  schedule: FeeSchedule,
  channels: SaleChannels,
): ProfitEstimate | null {
  if (priceCents === null || priceCents <= 0) {
    return null;
  }
  const [first, ...rest] = channels;
  return rest.reduce(
    (lowest, channel) => {
      const estimate = estimateOn(priceCents, product, schedule, channel);
      return estimate.profitCents < lowest.profitCents ? estimate : lowest;
    },
    estimateOn(priceCents, product, schedule, first),
  );
}

/** The highest of each channel's price, or null when some channel has none. */
function highestOnEveryChannel(
  channels: SaleChannels,
  priceOn: (channel: FeeChannel) => Cents | null,
): Cents | null {
  const prices: Cents[] = [];
  for (const channel of channels) {
    const price = priceOn(channel);
    if (price === null) {
      return null;
    }
    prices.push(price);
  }
  return Math.max(...prices);
}

/**
 * Smallest price whose profit is at least `marginPercent` of it after every fee, on every
 * channel. Null when the fees alone already eat that margin on one of them.
 */
export function priceForMargin(
  product: ProductCost,
  marginPercent: number,
  schedule: FeeSchedule,
  channels: SaleChannels,
): Cents | null {
  return highestOnEveryChannel(channels, (channel) =>
    priceKeepingMargin(product, marginPercent, onChannel(schedule, channel)),
  );
}

const SHELF_ENDING_CENTS = 90;
const CENTS_PER_REAL = 100;

/** The price itself if it already ends in ,90, else the next one that does. */
function nextShelfPrice(cents: Cents): Cents {
  return (
    Math.ceil((cents - SHELF_ENDING_CENTS) / CENTS_PER_REAL) * CENTS_PER_REAL + SHELF_ENDING_CENTS
  );
}

/**
 * Smallest price ending in ,90 (R$ 21,90) that still keeps the margin on every channel. Rounding
 * up alone is not enough: it can cross into a band that pays more shipping (R$ 18,95 becomes
 * R$ 19,90 on Mercado Livre), so the next ,90 prices are tried until one keeps it. Null when no
 * price keeps it.
 */
export function shelfPriceForMargin(
  product: ProductCost,
  marginPercent: number,
  schedule: FeeSchedule,
  channels: SaleChannels,
): Cents | null {
  const exact = priceForMargin(product, marginPercent, schedule, channels);
  if (exact === null) {
    return null;
  }
  const keepsMargin = (priceCents: Cents) => {
    const estimate = estimateProfit(priceCents, product, schedule, channels);
    return estimate !== null && estimate.profitCents * 100 >= priceCents * marginPercent;
  };
  for (
    let priceCents = nextShelfPrice(exact);
    priceCents <= LISTING_MAX_PRICE_CENTS;
    priceCents += CENTS_PER_REAL
  ) {
    if (keepsMargin(priceCents)) {
      return priceCents;
    }
  }
  return null;
}

/** The margins both price screens offer as one-tap shortcuts, in percent of the sale. */
export const MARGIN_SHORTCUTS = [25, 40, 55] as const;

/**
 * Each shortcut margin with the price it leads to (`shelfPriceForMargin`), so a new listing and
 * a price change offer the same margins at the same prices. Null when no price keeps it.
 */
export function marginShortcutPrices(
  product: ProductCost,
  schedule: FeeSchedule,
  channels: SaleChannels,
): { marginPercent: number; priceCents: Cents | null }[] {
  return MARGIN_SHORTCUTS.map((marginPercent) => ({
    marginPercent,
    priceCents: shelfPriceForMargin(product, marginPercent, schedule, channels),
  }));
}

/**
 * Lowest price the server accepts for the product on every channel: break-even, or the
 * configured minimum margin.
 */
export function minimumPrice(
  product: ProductCost,
  schedule: FeeSchedule,
  channels: SaleChannels,
): Cents | null {
  return highestOnEveryChannel(channels, (channel) =>
    minimumPriceCents(product, onChannel(schedule, channel)),
  );
}
