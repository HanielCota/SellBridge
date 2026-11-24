/** The Mercado Livre field where the supplier types the packed weight, in grams. */
export const PACKAGE_WEIGHT_ATTRIBUTE = "SELLER_PACKAGE_WEIGHT";

/**
 * Measures from here up are unreadable: no package weighs a thousand tonnes, and the SQL twin
 * (database/repositories/sql/product-weight.ts) stores the result in a Postgres integer.
 */
const UNREADABLE_MEASURE_FROM = 1_000_000_000;

/** "500", "32.5 cm", "30,2" or "850g": a positive number, optionally followed by the unit. */
const MEASURE = /^(\d+(?:[.,]\d+)?)\s*([a-z]*)$/i;

/**
 * A package measure typed by the supplier, as a whole number in `unit`, or null when it is not a
 * positive number in that unit. A fraction is rounded up: a package declared smaller than it is
 * gets a shipping quote that does not cover it.
 */
export function readPackageMeasure(stored: string, unit: "g" | "cm"): number | null {
  const match = MEASURE.exec(stored.trim());
  if (match === null) {
    return null;
  }
  const typedUnit = (match[2] ?? "").toLowerCase();
  if (typedUnit !== "" && typedUnit !== unit) {
    return null;
  }
  const measure = Number((match[1] ?? "").replace(",", "."));
  if (!Number.isFinite(measure) || measure <= 0 || measure >= UNREADABLE_MEASURE_FROM) {
    return null;
  }
  return Math.ceil(measure);
}

export interface WeighedProduct {
  readonly mercadoLivreAttributes: Readonly<Record<string, string>>;
  /** The product's own weight without packaging, from its NF-e data. */
  readonly netWeightGrams: number | null;
}

/**
 * The weight shipping is priced on, in grams: the packed weight Mercado Livre charges by, else
 * the product's own weight. Null when the supplier gave neither, and the fee model estimates.
 */
export function shippingWeightGrams(product: WeighedProduct): number | null {
  const packed = product.mercadoLivreAttributes[PACKAGE_WEIGHT_ATTRIBUTE];
  const packedGrams = packed === undefined ? null : readPackageMeasure(packed, "g");
  if (packedGrams !== null) {
    return packedGrams;
  }
  const { netWeightGrams } = product;
  if (netWeightGrams === null || netWeightGrams <= 0) {
    return null;
  }
  return Math.ceil(netWeightGrams);
}
