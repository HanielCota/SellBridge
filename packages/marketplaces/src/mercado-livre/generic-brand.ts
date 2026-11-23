import { isNoBrand, normalizedBrandWords } from "@sellbridge/shared/product-brand";
import type { FichaAttribute } from "./category-ficha.ts";

/**
 * Used when the category names no generic brand. Categories answered either "Genérica" (pillows,
 * headphones) or "Generic" (bags, T-shirts) in their BRAND hint and list on 2026-11-18.
 */
const DEFAULT_GENERIC_BRAND = "Genérica";
const GENERIC_BRAND_WORDS: ReadonlySet<string> = new Set(["generica", "generico", "generic"]);
/** The quoted word of the BRAND hint: "Informe a marca verdadeira do produto ou 'Generic' se…". */
const HINT_QUOTED_WORD = /['"‘’“”]([^'"‘’“”]{1,40})['"‘’“”]/u;

export interface SentBrand {
  readonly id: "BRAND";
  readonly value_name: string;
  readonly value_id?: string;
}

function isGenericBrandWord(name: string): boolean {
  return GENERIC_BRAND_WORDS.has(normalizedBrandWords(name));
}

/** The category's own generic brand: a listed value first, then the word its hint quotes. */
function categoryGenericBrand(definition: FichaAttribute | undefined): SentBrand {
  const listed = definition?.values.find(({ name }) => isGenericBrandWord(name));
  if (listed !== undefined) {
    return { id: "BRAND", value_name: listed.name, value_id: listed.id };
  }
  const quoted = definition?.hint?.match(HINT_QUOTED_WORD)?.[1];
  if (quoted !== undefined && isGenericBrandWord(quoted)) {
    return { id: "BRAND", value_name: quoted };
  }
  return { id: "BRAND", value_name: DEFAULT_GENERIC_BRAND };
}

/**
 * The BRAND to send, or null to send none. A product with no brand of its own (empty, "sem
 * marca"…) gets the category's generic brand, as the official "Atributos" page asks; it is only
 * added when the category has a BRAND field, or when the supplier typed a "no brand" word.
 */
export function brandToSend(
  storedBrand: string | undefined,
  definitions: readonly FichaAttribute[],
): SentBrand | null {
  const definition = definitions.find(({ id }) => id === "BRAND");
  if (storedBrand === undefined || isNoBrand(storedBrand)) {
    const typedNothing = storedBrand === undefined || storedBrand.trim() === "";
    if (definition === undefined && typedNothing) {
      return null;
    }
    return categoryGenericBrand(definition);
  }
  return { id: "BRAND", value_name: storedBrand.trim() };
}
