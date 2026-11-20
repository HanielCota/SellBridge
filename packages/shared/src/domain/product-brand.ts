/**
 * The one rule for a product with no brand of its own, shared by every marketplace: the supplier
 * leaves the brand empty or types a word that means "no brand". Each channel then sends its own
 * value: Mercado Livre the generic brand its category names ("Genérica" or "Generic"); Shopee
 * "No Brand" (brand_id 0) from its list.
 */

/** "no brand" as suppliers type it, without accents, case or spare spaces. */
const NO_BRAND_WORDS: ReadonlySet<string> = new Set([
  "sem marca",
  "s/ marca",
  "s/marca",
  "sem",
  "nenhuma",
  "nenhum",
  "nao tem",
  "nao possui",
  "generica",
  "generico",
  "generic",
  "no brand",
  "nobrand",
  "n/a",
  "-",
]);

/** Lower case, no accents, single spaces and no closing period: how brand words are compared. */
export function normalizedBrandWords(brand: string): string {
  return brand
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!]+$/u, "")
    .trim();
}

/** True when the product has no brand of its own: nothing typed, or a word that says so. */
export function isNoBrand(brand: string | null | undefined): boolean {
  if (brand === null || brand === undefined) {
    return true;
  }
  const normalized = normalizedBrandWords(brand);
  return normalized === "" || NO_BRAND_WORDS.has(normalized);
}
