import { mercadoLivreShippingBands, type ShippingPriceBand } from "./mercado-livre-shipping.ts";
import { percentOfCents, type Cents } from "./money.ts";

/** Where a sale happens; each one charges its own way. */
export type FeeChannel = "mercado_livre" | "tiktok_shop" | "shopee";

export const FEE_CHANNEL_NAMES: Readonly<Record<FeeChannel, string>> = {
  mercado_livre: "Mercado Livre",
  tiktok_shop: "TikTok Shop",
  shopee: "Shopee",
};

/** The channel after "as taxas": "do Mercado Livre", "da Shopee". */
export const FEE_CHANNEL_OWNERS: Readonly<Record<FeeChannel, string>> = {
  mercado_livre: "do Mercado Livre",
  tiktok_shop: "do TikTok Shop",
  shopee: "da Shopee",
};

/**
 * The fee channel of a store's marketplace. The local mock stands in for Mercado Livre, so it
 * charges like it.
 */
export function feeChannelOf(marketplaceId: string): FeeChannel {
  if (marketplaceId === "tiktok_shop" || marketplaceId === "shopee") {
    return marketplaceId;
  }
  return "mercado_livre";
}

/** What one sale pays its marketplace, in cents, line by line. */
export interface ChannelSaleFees {
  /** The percentage the marketplace keeps of the price. */
  commissionCents: Cents;
  /** The fixed amount per item, when the channel charges one. */
  fixedFeeCents: Cents;
  /** Shipping the seller pays: Mercado Envios on Mercado Livre, the Shipping Fee Program on TikTok. */
  shippingCents: Cents;
}

export interface ChannelFeeContext {
  /** Mercado Livre's commission for the item, in basis points; other channels ignore it. */
  mercadoLivreCommissionBasisPoints: number;
  /** Weight the shipping is priced on, in grams. */
  weightGrams: number;
  /**
   * The shipping the store pays per price band, read from Mercado Livre; absent uses the
   * published table for the weight.
   */
  mercadoLivreShippingBands?: readonly ShippingPriceBand[];
}

function shippingBandsOf(context: ChannelFeeContext): readonly ShippingPriceBand[] {
  return context.mercadoLivreShippingBands ?? mercadoLivreShippingBands(context.weightGrams);
}

/**
 * A price range where the fees are a straight line: `basisPoints` of the price plus
 * `fixedCents`. The price search solves each range by formula; the fees themselves always come
 * from `channelSaleFees`, so a range only has to be close, never exact.
 */
export interface FeeSegment {
  fromCents: Cents;
  toCents: Cents;
  basisPoints: number;
  fixedCents: Cents;
}

/** Largest price any segment reaches: past every listing ceiling. */
const OPEN_END_CENTS = Number.MAX_SAFE_INTEGER;

const HALF_BASIS_POINTS = 5_000;

/** Mercado Livre caps the shipping at half the price only under R$ 19 (the table's footnote). */
const MERCADO_LIVRE_HALF_PRICE_SHIPPING_UNDER_CENTS = 1_900;

/**
 * Mercado Livre, Clássico listing with Mercado Envios: the category commission (already
 * holding the fixed fee, which Mercado Envios items under the threshold no longer pay) plus the
 * shipping the seller pays on every sale, capped at half the price for the cheapest items.
 * Sources: developers.mercadolivre.com.br/pt_br/comissao-por-vender and
 * /pt_br/custos-de-envio (read 16/11/2026).
 */
function mercadoLivreFees(priceCents: Cents, context: ChannelFeeContext): ChannelSaleFees {
  const band = shippingBandsOf(context).find(
    (candidate) => priceCents >= candidate.fromCents && priceCents <= candidate.toCents,
  );
  const tableShippingCents = band?.shippingCents ?? 0;
  const shippingCents =
    priceCents < MERCADO_LIVRE_HALF_PRICE_SHIPPING_UNDER_CENTS
      ? Math.min(tableShippingCents, percentOfCents(priceCents, HALF_BASIS_POINTS))
      : tableShippingCents;
  return {
    commissionCents: percentOfCents(priceCents, context.mercadoLivreCommissionBasisPoints),
    fixedFeeCents: 0,
    shippingCents,
  };
}

function mercadoLivreSegments(context: ChannelFeeContext): FeeSegment[] {
  const commission = context.mercadoLivreCommissionBasisPoints;
  return shippingBandsOf(context).flatMap((band) => {
    // Under R$ 19 and under twice the table cost, half the price is the smaller shipping.
    const halfPriceEnd = Math.min(
      band.toCents,
      band.shippingCents * 2 - 1,
      MERCADO_LIVRE_HALF_PRICE_SHIPPING_UNDER_CENTS - 1,
    );
    const halfPrice: FeeSegment[] =
      halfPriceEnd >= band.fromCents
        ? [
            {
              fromCents: band.fromCents,
              toCents: halfPriceEnd,
              basisPoints: commission + HALF_BASIS_POINTS,
              fixedCents: 0,
            },
          ]
        : [];
    const tableFrom = Math.max(band.fromCents, halfPriceEnd + 1);
    const table: FeeSegment[] =
      tableFrom <= band.toCents
        ? [
            {
              fromCents: tableFrom,
              toCents: band.toCents,
              basisPoints: commission,
              fixedCents: band.shippingCents,
            },
          ]
        : [];
    return [...halfPrice, ...table];
  });
}

/** TikTok Shop Brasil: price under R$ 50 pays 10% + R$ 4,00, from R$ 50 on 6% + R$ 6,00. */
const TIKTOK_PRICE_THRESHOLD_CENTS = 5_000;
const TIKTOK_LOW_PRICE = { basisPoints: 1_000, fixedCents: 400 } as const;
const TIKTOK_HIGH_PRICE = { basisPoints: 600, fixedCents: 600 } as const;
/** Shipping Fee Program: 6% of the price, at most R$ 50 per item; sellers join it by default. */
const TIKTOK_SHIPPING_PROGRAM_BASIS_POINTS = 600;
const TIKTOK_SHIPPING_PROGRAM_CAP_CENTS = 5_000;
/** First price whose 6% reaches the R$ 50 cap. */
const TIKTOK_SHIPPING_CAP_FROM_CENTS = Math.ceil(
  (TIKTOK_SHIPPING_PROGRAM_CAP_CENTS * 10_000) / TIKTOK_SHIPPING_PROGRAM_BASIS_POINTS,
);

/**
 * Sources: seller-br.tiktok.com/university/essay?knowledge_id=24428156307201 (commission, in
 * force since 15/07/2026) and knowledge_id=5665577566734097 (Shipping Fee Program), read
 * 16/11/2026. TikTok has no fee estimate before the sale, so these are the published rates.
 */
function tiktokShopFees(priceCents: Cents): ChannelSaleFees {
  const rate = priceCents < TIKTOK_PRICE_THRESHOLD_CENTS ? TIKTOK_LOW_PRICE : TIKTOK_HIGH_PRICE;
  return {
    commissionCents: percentOfCents(priceCents, rate.basisPoints),
    fixedFeeCents: rate.fixedCents,
    shippingCents: Math.min(
      percentOfCents(priceCents, TIKTOK_SHIPPING_PROGRAM_BASIS_POINTS),
      TIKTOK_SHIPPING_PROGRAM_CAP_CENTS,
    ),
  };
}

function tiktokShopSegments(): FeeSegment[] {
  return [
    {
      fromCents: 0,
      toCents: TIKTOK_PRICE_THRESHOLD_CENTS - 1,
      basisPoints: TIKTOK_LOW_PRICE.basisPoints + TIKTOK_SHIPPING_PROGRAM_BASIS_POINTS,
      fixedCents: TIKTOK_LOW_PRICE.fixedCents,
    },
    {
      fromCents: TIKTOK_PRICE_THRESHOLD_CENTS,
      toCents: TIKTOK_SHIPPING_CAP_FROM_CENTS - 1,
      basisPoints: TIKTOK_HIGH_PRICE.basisPoints + TIKTOK_SHIPPING_PROGRAM_BASIS_POINTS,
      fixedCents: TIKTOK_HIGH_PRICE.fixedCents,
    },
    {
      fromCents: TIKTOK_SHIPPING_CAP_FROM_CENTS,
      toCents: OPEN_END_CENTS,
      basisPoints: TIKTOK_HIGH_PRICE.basisPoints,
      fixedCents: TIKTOK_HIGH_PRICE.fixedCents + TIKTOK_SHIPPING_PROGRAM_CAP_CENTS,
    },
  ];
}

interface ShopeeBand {
  fromCents: Cents;
  basisPoints: number;
  fixedCents: Cents;
}

/**
 * Shopee Brasil, CNPJ seller (commission already holds the transaction fee). Source:
 * seller.shopee.com.br/edu/article/26839 (updated 01/10/2026, read 16/11/2026). There is no
 * Shopee connector yet: this only estimates a price.
 */
const SHOPEE_BANDS: readonly ShopeeBand[] = [
  { fromCents: 0, basisPoints: 2_000, fixedCents: 450 },
  { fromCents: 8_000, basisPoints: 1_400, fixedCents: 1_600 },
  { fromCents: 10_000, basisPoints: 1_400, fixedCents: 2_000 },
  { fromCents: 20_000, basisPoints: 1_400, fixedCents: 2_600 },
];
/** Under R$ 9,00 the fixed part is half the price instead. */
const SHOPEE_HALF_FIXED_UNDER_CENTS = 900;

function shopeeBandOf(priceCents: Cents): ShopeeBand {
  const band = SHOPEE_BANDS.findLast((candidate) => priceCents >= candidate.fromCents);
  if (band === undefined) {
    throw new Error(`No Shopee fee band for price ${priceCents}`);
  }
  return band;
}

function shopeeFees(priceCents: Cents): ChannelSaleFees {
  const band = shopeeBandOf(priceCents);
  const fixedFeeCents =
    priceCents < SHOPEE_HALF_FIXED_UNDER_CENTS
      ? percentOfCents(priceCents, HALF_BASIS_POINTS)
      : band.fixedCents;
  return {
    commissionCents: percentOfCents(priceCents, band.basisPoints),
    fixedFeeCents,
    shippingCents: 0,
  };
}

function shopeeSegments(): FeeSegment[] {
  const halfFixed: FeeSegment = {
    fromCents: 0,
    toCents: SHOPEE_HALF_FIXED_UNDER_CENTS - 1,
    basisPoints: shopeeBandOf(0).basisPoints + HALF_BASIS_POINTS,
    fixedCents: 0,
  };
  const banded = SHOPEE_BANDS.map((band, index) => {
    const nextStart = SHOPEE_BANDS[index + 1]?.fromCents;
    return {
      fromCents: Math.max(band.fromCents, SHOPEE_HALF_FIXED_UNDER_CENTS),
      toCents: nextStart === undefined ? OPEN_END_CENTS : nextStart - 1,
      basisPoints: band.basisPoints,
      fixedCents: band.fixedCents,
    };
  });
  return [halfFixed, ...banded];
}

/** Every fee one unit sold at the price pays on the channel. */
export function channelSaleFees(
  channel: FeeChannel,
  priceCents: Cents,
  context: ChannelFeeContext,
): ChannelSaleFees {
  if (channel === "tiktok_shop") {
    return tiktokShopFees(priceCents);
  }
  if (channel === "shopee") {
    return shopeeFees(priceCents);
  }
  return mercadoLivreFees(priceCents, context);
}

export function totalChannelFeeCents(fees: ChannelSaleFees): Cents {
  return fees.commissionCents + fees.fixedFeeCents + fees.shippingCents;
}

/** The channel's fees as straight-line price ranges, in price order, for the price search. */
export function channelFeeSegments(channel: FeeChannel, context: ChannelFeeContext): FeeSegment[] {
  if (channel === "tiktok_shop") {
    return tiktokShopSegments();
  }
  if (channel === "shopee") {
    return shopeeSegments();
  }
  return mercadoLivreSegments(context);
}
