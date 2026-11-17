import type { Cents } from "./money.ts";

/**
 * What the seller pays Mercado Livre for shipping on each sale (Mercado Envios: Full, Coleta and
 * Agências), by price and weight. It applies even when the buyer pays the shipping. Official
 * table for MercadoLíder, green reputation and sellers without reputation, read 16/11/2026:
 * https://www.mercadolivre.com.br/ajuda/40538 (yellow, orange and red sellers pay more:
 * /ajuda/40545 and /ajuda/40547; the live reading per store covers them).
 */
const PRICE_BAND_STARTS_CENTS: readonly Cents[] = [
  0, 1_900, 4_900, 7_900, 10_000, 12_000, 15_000, 20_000,
];

interface WeightBand {
  /** Heaviest weight of the band, inclusive; null for the last, open band. */
  upToGrams: number | null;
  /** One cost per price band, in `PRICE_BAND_STARTS_CENTS` order. */
  costsCents: readonly Cents[];
}

const WEIGHT_BANDS: readonly WeightBand[] = [
  { upToGrams: 300, costsCents: [565, 685, 815, 1_295, 1_495, 1_695, 1_905, 2_165] },
  { upToGrams: 500, costsCents: [595, 695, 825, 1_385, 1_615, 1_815, 2_045, 2_325] },
  { upToGrams: 1_000, costsCents: [605, 715, 845, 1_445, 1_685, 1_905, 2_135, 2_445] },
  { upToGrams: 1_500, costsCents: [615, 735, 865, 1_475, 1_715, 1_945, 2_175, 2_545] },
  { upToGrams: 2_000, costsCents: [625, 745, 875, 1_505, 1_765, 1_985, 2_225, 2_555] },
  { upToGrams: 3_000, costsCents: [635, 865, 915, 1_645, 1_915, 2_165, 2_435, 2_705] },
  { upToGrams: 4_000, costsCents: [645, 875, 975, 1_785, 2_075, 2_335, 2_635, 2_925] },
  { upToGrams: 5_000, costsCents: [655, 885, 1_025, 1_975, 2_285, 2_605, 2_925, 3_245] },
  { upToGrams: 6_000, costsCents: [665, 895, 1_035, 2_595, 2_915, 3_335, 3_645, 4_085] },
  { upToGrams: 7_000, costsCents: [675, 905, 1_045, 2_755, 3_165, 3_675, 4_085, 4_525] },
  { upToGrams: 8_000, costsCents: [685, 925, 1_055, 2_945, 3_435, 3_925, 4_415, 4_935] },
  { upToGrams: 9_000, costsCents: [695, 935, 1_065, 3_025, 3_525, 4_035, 4_535, 5_075] },
  { upToGrams: 10_000, costsCents: [705, 945, 1_085, 3_825, 4_505, 5_195, 5_875, 6_585] },
  { upToGrams: 11_000, costsCents: [705, 965, 1_105, 4_165, 4_855, 5_545, 6_235, 6_935] },
  { upToGrams: 13_000, costsCents: [715, 1_005, 1_145, 4_255, 4_975, 5_685, 6_385, 7_095] },
  { upToGrams: 15_000, costsCents: [725, 1_025, 1_165, 4_555, 5_295, 6_055, 6_815, 7_565] },
  { upToGrams: 17_000, costsCents: [735, 1_045, 1_185, 4_895, 5_655, 6_405, 7_135, 7_935] },
  { upToGrams: 20_000, costsCents: [745, 1_065, 1_205, 5_515, 6_435, 7_355, 8_275, 9_195] },
  { upToGrams: 25_000, costsCents: [765, 1_105, 1_225, 6_455, 7_575, 8_545, 9_625, 10_685] },
  { upToGrams: 30_000, costsCents: [775, 1_125, 1_245, 6_645, 7_605, 8_625, 9_715, 10_785] },
  { upToGrams: 40_000, costsCents: [785, 1_145, 1_265, 6_835, 7_965, 8_975, 10_005, 10_795] },
  { upToGrams: 50_000, costsCents: [795, 1_165, 1_285, 7_095, 8_185, 9_285, 10_345, 11_165] },
  { upToGrams: 60_000, costsCents: [805, 1_185, 1_305, 7_555, 8_725, 9_905, 11_025, 11_905] },
  { upToGrams: 70_000, costsCents: [815, 1_205, 1_325, 8_095, 9_375, 10_595, 11_805, 12_745] },
  { upToGrams: 80_000, costsCents: [825, 1_225, 1_345, 8_465, 9_795, 11_075, 12_335, 13_315] },
  { upToGrams: 90_000, costsCents: [835, 1_245, 1_365, 9_405, 10_835, 12_295, 13_695, 14_785] },
  { upToGrams: 100_000, costsCents: [845, 1_265, 1_385, 10_745, 12_485, 14_045, 15_645, 16_885] },
  { upToGrams: 125_000, costsCents: [855, 1_285, 1_405, 12_015, 13_895, 15_695, 17_485, 18_885] },
  { upToGrams: 150_000, costsCents: [865, 1_285, 1_425, 12_745, 14_705, 16_655, 18_555, 20_035] },
  { upToGrams: null, costsCents: [875, 1_285, 1_445, 16_705, 19_335, 21_845, 24_345, 26_285] },
];

export interface ShippingPriceBand {
  fromCents: Cents;
  /** Last price of the band, inclusive. */
  toCents: Cents;
  shippingCents: Cents;
}

function weightBandOf(weightGrams: number): WeightBand {
  const band = WEIGHT_BANDS.find(
    (candidate) => candidate.upToGrams === null || weightGrams <= candidate.upToGrams,
  );
  if (band === undefined) {
    throw new Error(`No Mercado Livre shipping band for ${weightGrams} g`);
  }
  return band;
}

function bandEndCents(index: number): Cents {
  const nextStart = PRICE_BAND_STARTS_CENTS[index + 1];
  return nextStart === undefined ? Number.MAX_SAFE_INTEGER : nextStart - 1;
}

/** One cost per price band, in band order, as bands; throws when a band has no cost. */
function bandsWithCosts(costsCents: readonly Cents[], source: string): ShippingPriceBand[] {
  if (costsCents.length !== PRICE_BAND_STARTS_CENTS.length) {
    throw new Error(
      `${source} has ${costsCents.length} shipping costs for ${PRICE_BAND_STARTS_CENTS.length} price bands`,
    );
  }
  return PRICE_BAND_STARTS_CENTS.map((fromCents, index) => {
    const shippingCents = costsCents[index];
    if (shippingCents === undefined || !Number.isSafeInteger(shippingCents) || shippingCents < 0) {
      throw new Error(`${source} misses the shipping of price band ${index}`);
    }
    return { fromCents, toCents: bandEndCents(index), shippingCents };
  });
}

/**
 * The table's row for the weight, as price bands with the shipping each one pays. Products under
 * R$ 19 pay at most half their price; that cap is applied by the fee calculation.
 */
export function mercadoLivreShippingBands(weightGrams: number): ShippingPriceBand[] {
  return bandsWithCosts(weightBandOf(weightGrams).costsCents, `Shipping row for ${weightGrams} g`);
}

/**
 * One price inside each band, in band order, to ask Mercado Livre what the store pays there:
 * the band's last price, or its first for the open last band. Every reputation's table shares
 * these bands (mercadolivre.com.br/ajuda/40538, 40545 and 40547).
 */
export function shippingQuotePricesCents(): Cents[] {
  return PRICE_BAND_STARTS_CENTS.map((fromCents, index) => {
    const toCents = bandEndCents(index);
    return toCents === Number.MAX_SAFE_INTEGER ? fromCents : toCents;
  });
}

/** The costs Mercado Livre quoted at `shippingQuotePricesCents`, as price bands. */
export function shippingBandsFromQuotes(costsCents: readonly Cents[]): ShippingPriceBand[] {
  return bandsWithCosts(costsCents, "Mercado Livre quote");
}
