import type { FichaField } from "@sellbridge/marketplaces";
import type { RequiredAttribute } from "@sellbridge/shared/supplier-panel-catalog-completeness";

/** The title length from which Mercado Livre's category guess is worth asking for. */
export const MIN_TITLE_FOR_CATEGORY = 10;

/** Optional sheet fields shown before "Mostrar mais": the rest stays one tap away. */
export const VISIBLE_OPTIONAL_FIELDS = 6;

/** Our own required attributes, then the ones Mercado Livre requires that we did not name yet. */
export function withMercadoLivreRequired(
  own: readonly RequiredAttribute[],
  fields: readonly FichaField[] | null,
): readonly RequiredAttribute[] {
  if (fields === null) {
    return own;
  }
  const named = new Set(own.map((attribute) => attribute.id));
  const added = fields
    .filter((field) => field.required && !named.has(field.id))
    .map((field) => ({ id: field.id, label: field.label }));
  return added.length === 0 ? own : [...own, ...added];
}

/** "12 cm" → "12": the field shows the number, the unit sits in its label. */
export function measureNumber(stored: string, unit: string | null): string {
  const trimmed = stored.trim();
  if (unit === null || !trimmed.endsWith(` ${unit}`)) {
    return trimmed;
  }
  return trimmed.slice(0, -(unit.length + 1));
}

/** "12" → "12 cm", as Mercado Livre reads a measure; a blank field stays blank. */
export function measureWithUnit(typed: string, unit: string | null): string {
  const trimmed = typed.trim();
  if (trimmed === "" || unit === null) {
    return trimmed;
  }
  return `${trimmed} ${unit}`;
}
