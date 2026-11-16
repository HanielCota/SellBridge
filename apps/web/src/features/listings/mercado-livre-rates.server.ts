import {
  findFeeQuotes,
  findMercadoLivreFeeAccess,
  findProductFeeProfile,
  type MercadoLivreFeeAccess,
  type ProductFeeProfile,
  saveFeeQuotes,
} from "@sellbridge/database/repositories";
import {
  packageDimensionsOf,
  type PackageDimensions,
  readMercadoLivreCommission,
  readMercadoLivreShippingCost,
} from "@sellbridge/marketplaces";
import {
  costliestMercadoLivreRates,
  type FeeSchedule,
  type MercadoLivreStoreRates,
} from "@sellbridge/shared/fee-model";
import { logger } from "@sellbridge/shared/logger";
import {
  mercadoLivreShippingBands,
  shippingBandsFromQuotes,
  shippingQuotePricesCents,
} from "@sellbridge/shared/mercado-livre-shipping";
import { feeScheduleFrom } from "@/features/reports/fee-schedule";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { mercadoLivreApiConfig, tokenCipher } from "@/lib/server/marketplaces";
import { createRefusalMemory, type Quote, readQuotes } from "./quote-cache";

/**
 * The commission is asked at R$ 100,00: above the free shipping threshold no fixed fee mixes in,
 * and a category's percentage seldom changes with the price.
 */
const COMMISSION_QUOTE_PRICE_CENTS = 10_000;

/**
 * These reads only inform a preview: one try each, no retries. A store that does not answer
 * prices on what was saved or on the estimate, and is not asked again for a while.
 */
const quoteConfig = {
  ...mercadoLivreApiConfig,
  retry: { ...mercadoLivreApiConfig.retry, retries: 0 },
};

/** Per server process: a refusal rests a while instead of being asked on every view. */
const refusals = createRefusalMemory();

/** A product's Mercado Livre costs on the reseller's stores, and where they came from. */
export interface MercadoLivreRatesReading {
  /** Of several stores, the costliest (fee-model.ts `costliestMercadoLivreRates`). */
  rates: MercadoLivreStoreRates;
  /** Every store's commission came from Mercado Livre, not from the configured estimate. */
  liveCommission: boolean;
  /** Every store's shipping came from Mercado Livre, not from the published table. */
  liveShipping: boolean;
  /** When the oldest answer used was read, in ISO 8601; null when none came from Mercado Livre. */
  readAt: string | null;
}

interface StoreReading {
  rates: MercadoLivreStoreRates;
  liveCommission: boolean;
  liveShipping: boolean;
  used: Quote[];
}

interface ProductQuotes {
  profile: ProductFeeProfile;
  schedule: FeeSchedule;
  dimensions: PackageDimensions | null;
}

function estimateFor({ profile, schedule }: ProductQuotes): MercadoLivreStoreRates {
  const category = profile.categoryId;
  return {
    commissionBasisPoints:
      (category === null ? undefined : schedule.categoryFeeBasisPoints[category]) ??
      schedule.marketplaceFeeBasisPoints,
    shippingBands: mercadoLivreShippingBands(profile.weightGrams ?? schedule.defaultWeightGrams),
  };
}

function dimensionsKey(dimensions: PackageDimensions): string {
  const { heightCentimeters, widthCentimeters, lengthCentimeters, weightGrams } = dimensions;
  return `${heightCentimeters}x${widthCentimeters}x${lengthCentimeters},${weightGrams}`;
}

/** What to ask the store for this product, by quote key. */
function askersFor(
  access: MercadoLivreFeeAccess,
  product: ProductQuotes,
): Map<string, () => Promise<number>> {
  const store = {
    externalShopId: access.externalShopId,
    accessToken: tokenCipher.decrypt(access.accessTokenEnc),
  };
  const askers = new Map<string, () => Promise<number>>();
  const { categoryId } = product.profile;
  if (categoryId !== null) {
    askers.set(`commission:${categoryId}`, () =>
      readMercadoLivreCommission(quoteConfig, store, {
        categoryId,
        priceCents: COMMISSION_QUOTE_PRICE_CENTS,
      }),
    );
  }
  const { dimensions } = product;
  if (dimensions === null) {
    return askers;
  }
  for (const priceCents of shippingQuotePricesCents()) {
    askers.set(`shipping:${dimensionsKey(dimensions)}:${priceCents}`, () =>
      readMercadoLivreShippingCost(quoteConfig, store, { dimensions, priceCents }),
    );
  }
  return askers;
}

function loggedAsk(
  storeConnectionId: string,
  askers: ReadonlyMap<string, () => Promise<number>>,
): (quoteKey: string) => Promise<number> {
  return async (quoteKey) => {
    const ask = askers.get(quoteKey);
    if (ask === undefined) {
      throw new Error(`No Mercado Livre request for quote ${quoteKey}`);
    }
    try {
      return await ask();
    } catch (error) {
      refusals.remember(`${storeConnectionId}:${quoteKey}`, new Date());
      logger.warn("mercado_livre.fee_quote_failed", {
        storeConnectionId,
        quote: quoteKey.split(":")[0],
        reason: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
  };
}

function storeReadingFrom(
  quotes: ReadonlyMap<string, Quote>,
  keys: { commission: string | null; shipping: string[] },
  estimate: MercadoLivreStoreRates,
): StoreReading {
  const commission = keys.commission === null ? undefined : quotes.get(keys.commission);
  const shipping = keys.shipping.flatMap((key) => {
    const quote = quotes.get(key);
    return quote === undefined ? [] : [quote];
  });
  const liveShipping = keys.shipping.length > 0 && shipping.length === keys.shipping.length;
  return {
    rates: {
      commissionBasisPoints: commission?.amount ?? estimate.commissionBasisPoints,
      shippingBands: liveShipping
        ? shippingBandsFromQuotes(shipping.map((quote) => quote.amount))
        : estimate.shippingBands,
    },
    liveCommission: commission !== undefined,
    liveShipping,
    used: [...(commission === undefined ? [] : [commission]), ...(liveShipping ? shipping : [])],
  };
}

async function readStore(
  access: MercadoLivreFeeAccess,
  product: ProductQuotes,
  now: Date,
): Promise<StoreReading> {
  const askers = askersFor(access, product);
  const quoteKeys = [...askers.keys()];
  const saved = await findFeeQuotes(database, access.storeConnectionId, quoteKeys);
  const reading = await readQuotes({
    quoteKeys,
    saved,
    now,
    ask: loggedAsk(access.storeConnectionId, askers),
    isResting: (quoteKey) => refusals.isResting(`${access.storeConnectionId}:${quoteKey}`, now),
  });
  await saveFeeQuotes(database, access.storeConnectionId, reading.asked);
  const commissionKey = quoteKeys.find((key) => key.startsWith("commission:")) ?? null;
  return storeReadingFrom(
    reading.quotes,
    { commission: commissionKey, shipping: quoteKeys.filter((key) => key.startsWith("shipping:")) },
    estimateFor(product),
  );
}

/** A store that cannot be asked at all (its token unreadable) prices on the estimate. */
async function readStoreOrEstimate(
  access: MercadoLivreFeeAccess,
  product: ProductQuotes,
  now: Date,
): Promise<StoreReading> {
  try {
    return await readStore(access, product, now);
  } catch (error) {
    logger.warn("mercado_livre.fee_rates_unavailable", {
      storeConnectionId: access.storeConnectionId,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return { rates: estimateFor(product), liveCommission: false, liveShipping: false, used: [] };
  }
}

function oldestReadAt(readings: readonly StoreReading[]): string | null {
  const times = readings.flatMap((reading) => reading.used.map((quote) => quote.readAt.getTime()));
  return times.length === 0 ? null : new Date(Math.min(...times)).toISOString();
}

/**
 * The product's commission and shipping as the reseller's Mercado Livre stores charge them,
 * read with each store's account and kept a day (a week when Mercado Livre does not answer).
 * Null when none of the stores is a connected Mercado Livre account or the product is unknown.
 */
export async function readMercadoLivreRates(
  tenantId: string,
  request: { productId: string; storeIds: readonly string[] },
): Promise<MercadoLivreRatesReading | null> {
  const now = new Date();
  const [stores, profile] = await Promise.all([
    findMercadoLivreFeeAccess(database, tenantId, request.storeIds, now),
    findProductFeeProfile(database, request.productId),
  ]);
  if (stores.length === 0 || profile === null) {
    return null;
  }
  const product = {
    profile,
    schedule: feeScheduleFrom(environment),
    dimensions: packageDimensionsOf(profile.attributes),
  };
  // One store at a time: each asks up to nine values at once, never more.
  const readings: StoreReading[] = [];
  for (const store of stores) {
    readings.push(await readStoreOrEstimate(store, product, now));
  }
  const rates = costliestMercadoLivreRates(readings.map((reading) => reading.rates));
  if (rates === null) {
    return null;
  }
  return {
    rates,
    liveCommission: readings.every((reading) => reading.liveCommission),
    liveShipping: readings.every((reading) => reading.liveShipping),
    readAt: oldestReadAt(readings),
  };
}
