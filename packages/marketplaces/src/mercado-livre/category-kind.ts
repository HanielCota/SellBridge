import { stripAccents } from "@sellbridge/shared/text";
import type { FichaAttribute } from "./category-ficha.ts";

/**
 * Sheet fields whose answer is the kind of product, which its title or its category often
 * already says: "Chinelo Nuvem" is a "Chinelo". Bling has no such field, so imported shoes
 * arrive without it.
 */
const KIND_ATTRIBUTE_IDS: ReadonlySet<string> = new Set(["FOOTWEAR_TYPE"]);

export interface KindAttribute {
  id: string;
  value_id: string;
  value_name: string;
}

type ListedValue = FichaAttribute["values"][number];

/** "Sandálias" and "Sandália" name the same kind: accents, case and a plural "s" are ignored. */
function kindKey(name: string): string {
  return stripAccents(name).trim().toLowerCase().replace(/s$/, "");
}

function wordKeys(text: string): Set<string> {
  return new Set(
    text
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word !== "")
      .map(kindKey),
  );
}

/**
 * Shoe names Mercado Livre does not list, read as the listed kind closest to them; the supplier
 * can still pick another in the product sheet. Babuche as Chinelo: Guilherme's choice, 2026-11-27.
 */
const KIND_SYNONYMS: ReadonlyMap<string, string> = new Map([["babuche", "chinelo"]]);

function titleKeys(title: string): Set<string> {
  const words = wordKeys(title);
  const synonyms = [...words].flatMap((word) => {
    const synonym = KIND_SYNONYMS.get(word);
    return synonym === undefined ? [] : [synonym];
  });
  return new Set([...words, ...synonyms]);
}

function onlyMatch(definition: FichaAttribute, matches: (value: ListedValue) => boolean) {
  const found = definition.values.filter(matches);
  const [only] = found;
  return found.length === 1 && only !== undefined ? only : null;
}

function answered(
  definitions: readonly FichaAttribute[],
  pick: (definition: FichaAttribute) => ListedValue | null,
): KindAttribute[] {
  return definitions.flatMap((definition) => {
    const value = pick(definition);
    return value === null
      ? []
      : [{ id: definition.id, value_id: value.id, value_name: value.name }];
  });
}

/** The kind fields this category asks that the supplier left empty. */
export function missingKindDefinitions(
  definitions: readonly FichaAttribute[],
  provided: Readonly<Record<string, string>>,
): FichaAttribute[] {
  return definitions.filter(
    ({ id }) => KIND_ATTRIBUTE_IDS.has(id) && (provided[id] ?? "").trim() === "",
  );
}

/**
 * Each given kind field answered by the one listed value whose words all appear in the title
 * ("Chinelo Nuvem Preto" is a "Chinelo"), with Mercado Livre's value id. None or several: empty.
 */
export function kindAttributesFromTitle(
  definitions: readonly FichaAttribute[],
  title: string,
): KindAttribute[] {
  const titleWords = titleKeys(title);
  return answered(definitions, (definition) =>
    onlyMatch(definition, ({ name }) => {
      const valueWords = [...wordKeys(name)];
      return valueWords.length > 0 && valueWords.every((word) => titleWords.has(word));
    }),
  );
}

/**
 * Each given kind field answered by the one listed value named like the whole category ("Tênis"
 * in Tênis). None or several: the field stays empty and the required-field check names it for
 * the supplier to fill.
 */
export function kindAttributesFromCategory(
  definitions: readonly FichaAttribute[],
  categoryName: string,
): KindAttribute[] {
  if (categoryName.trim() === "") {
    return [];
  }
  const key = kindKey(categoryName);
  return answered(definitions, (definition) =>
    onlyMatch(definition, ({ name }) => kindKey(name) === key),
  );
}
