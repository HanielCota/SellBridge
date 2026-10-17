/**
 * The Mercado Livre attributes the supplier panel asks for, in the words a person reads. The
 * stored key stays the marketplace code (`SELLER_PACKAGE_WEIGHT`); every screen shows the label
 * and, for package measures, the unit, so "900" never stands alone.
 */
export const PRODUCT_ATTRIBUTE_UNITS = ["g", "cm"] as const;
export type ProductAttributeUnit = (typeof PRODUCT_ATTRIBUTE_UNITS)[number];

export interface ProductAttributeDefinition {
  readonly id: string;
  readonly label: string;
  readonly unit: ProductAttributeUnit | null;
}

/** Every attribute the panel names, in the order the form shows them. */
export const PRODUCT_ATTRIBUTES: readonly ProductAttributeDefinition[] = [
  { id: "BRAND", label: "Marca", unit: null },
  { id: "MODEL", label: "Modelo", unit: null },
  { id: "GTIN", label: "Código de barras (GTIN)", unit: null },
  { id: "SELLER_PACKAGE_WEIGHT", label: "Peso da embalagem", unit: "g" },
  { id: "SELLER_PACKAGE_HEIGHT", label: "Altura da embalagem", unit: "cm" },
  { id: "SELLER_PACKAGE_WIDTH", label: "Largura da embalagem", unit: "cm" },
  { id: "SELLER_PACKAGE_LENGTH", label: "Comprimento da embalagem", unit: "cm" },
  { id: "GENDER", label: "Gênero", unit: null },
  { id: "SIZE", label: "Tamanho", unit: null },
];

function definitionOf(id: string): ProductAttributeDefinition | undefined {
  return PRODUCT_ATTRIBUTES.find((attribute) => attribute.id === id);
}

/** "MAIN_COLOR" reads as "Main color": an attribute the panel does not know yet is still words. */
function humanize(id: string): string {
  const words = id.toLowerCase().replaceAll("_", " ").trim();
  return words.length === 0 ? id : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export function attributeLabel(id: string): string {
  return definitionOf(id)?.label ?? humanize(id);
}

/** The label with its unit, as a form field names it: "Peso da embalagem (g)". */
export function attributeFieldLabel(id: string): string {
  const unit = definitionOf(id)?.unit ?? null;
  return unit === null ? attributeLabel(id) : `${attributeLabel(id)} (${unit})`;
}

/** A plain number gets the attribute's unit; anything else is shown as the supplier typed it. */
export function formatAttributeValue(id: string, value: string): string {
  const unit = definitionOf(id)?.unit ?? null;
  const trimmed = value.trim();
  if (unit === null || !/^\d+([.,]\d+)?$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} ${unit}`;
}
