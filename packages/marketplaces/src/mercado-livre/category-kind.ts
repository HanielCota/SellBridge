import { stripAccents } from "@sellbridge/shared/text";
import type { FichaAttribute } from "./category-ficha.ts";

/**
 * Sheet fields whose answer is the kind of product the category already names: "Tipo de
 * calçado" in the category "Tênis" is "Tênis". Bling has no such field, so imported shoes
 * arrive without it.
 */
const KIND_ATTRIBUTE_IDS: ReadonlySet<string> = new Set(["FOOTWEAR_TYPE"]);

export interface KindAttribute {
  id: string;
  value_id: string;
  value_name: string;
}

/** "Sandálias" and "Sandália" name the same kind: accents, case and a plural "s" are ignored. */
function kindKey(name: string): string {
  return stripAccents(name).trim().toLowerCase().replace(/s$/, "");
}

/** The one listed value named like the category, or null when none or several are. */
function valueNamedLike(
  definition: FichaAttribute,
  categoryName: string,
): FichaAttribute["values"][number] | null {
  const key = kindKey(categoryName);
  const matches = definition.values.filter(({ name }) => kindKey(name) === key);
  const [only] = matches;
  return matches.length === 1 && only !== undefined ? only : null;
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
 * Each missing kind field answered by the category's own name, with Mercado Livre's value id.
 * A field whose list has no value, or more than one, named like the category stays empty: the
 * required-field check then names it for the supplier to fill.
 */
export function kindAttributesFromCategory(
  definitions: readonly FichaAttribute[],
  categoryName: string,
): KindAttribute[] {
  if (categoryName.trim() === "") {
    return [];
  }
  return definitions.flatMap((definition) => {
    const value = valueNamedLike(definition, categoryName);
    return value === null
      ? []
      : [{ id: definition.id, value_id: value.id, value_name: value.name }];
  });
}
