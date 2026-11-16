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

/** "500", "32.5 cm", "30,2" or "850g": a positive number, optionally followed by the unit. */
const MEASURE = /^(\d+(?:[.,]\d+)?)\s*([a-z]*)$/i;

export function isPackageAttribute(id: string): boolean {
  return Object.hasOwn(PACKAGE_UNITS, id);
}

/**
 * The value to send for a package attribute, or null when the stored text is not a positive
 * number in the attribute's unit. A fraction is rounded up: a package declared smaller than it
 * is gets a shipping quote that does not cover it.
 */
export function packageAttributeValue(id: string, stored: string): string | null {
  const unit = PACKAGE_UNITS[id];
  if (unit === undefined) {
    throw new Error(`Not a package attribute: ${id}`);
  }
  const match = MEASURE.exec(stored.trim());
  if (match === null) {
    return null;
  }
  const typedUnit = (match[2] ?? "").toLowerCase();
  if (typedUnit !== "" && typedUnit !== unit) {
    return null;
  }
  const measure = Number((match[1] ?? "").replace(",", "."));
  if (Number.isFinite(measure) && measure > 0) {
    return `${Math.ceil(measure)} ${unit}`;
  }
  return null;
}
