import { readPackageMeasure } from "@sellbridge/shared/shipping-weight";

/**
 * The package attributes as Mercado Livre takes them: whole numbers, grams for the weight and
 * centimeters for the sides, written "500 g" and "12 cm" (official "Atributos" page, section
 * "Atributos de Dimensões do Pacote", read on 2026-11-16; error 5402 otherwise).
 */
const PACKAGE_UNITS: Readonly<Record<string, "g" | "cm">> = {
  SELLER_PACKAGE_WEIGHT: "g",
  SELLER_PACKAGE_HEIGHT: "cm",
  SELLER_PACKAGE_WIDTH: "cm",
  SELLER_PACKAGE_LENGTH: "cm",
};

export function isPackageAttribute(id: string): boolean {
  return Object.hasOwn(PACKAGE_UNITS, id);
}

/**
 * The value to send for a package attribute, or null when the stored text is not a positive
 * number in the attribute's unit (`readPackageMeasure`, the reading the fee model uses too).
 */
export function packageAttributeValue(id: string, stored: string): string | null {
  const unit = PACKAGE_UNITS[id];
  if (unit === undefined) {
    throw new Error(`Not a package attribute: ${id}`);
  }
  const measure = readPackageMeasure(stored, unit);
  if (measure === null) {
    return null;
  }
  return `${measure} ${unit}`;
}
