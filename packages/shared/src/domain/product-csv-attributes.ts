/**
 * Item 18: the CSV columns that become Mercado Livre attributes. The marketplace refuses a
 * listing whose category requires brand, model or barcode and gets none, and needs the package
 * size to quote shipping; the import used to leave all of them out.
 */

/** Longest value the marketplace accepts in an attribute (same rule as the product form). */
const MAX_ATTRIBUTE_LENGTH = 255;
const MAX_PACKAGE_GRAMS = 100_000;
const MAX_PACKAGE_CENTIMETERS = 300;

interface TextColumn {
  readonly column: string;
  readonly attribute: string;
  readonly label: string;
}

interface MeasureColumn extends TextColumn {
  readonly unit: "g" | "cm";
  readonly unitName: string;
  readonly maximum: number;
}

const TEXT_COLUMNS: readonly TextColumn[] = [
  { column: "marca", attribute: "BRAND", label: "Marca" },
  { column: "modelo", attribute: "MODEL", label: "Modelo" },
];

const MEASURE_COLUMNS: readonly MeasureColumn[] = [
  {
    column: "peso_g",
    attribute: "SELLER_PACKAGE_WEIGHT",
    label: "Peso",
    unit: "g",
    unitName: "gramas",
    maximum: MAX_PACKAGE_GRAMS,
  },
  ...(
    [
      ["altura_cm", "SELLER_PACKAGE_HEIGHT", "Altura"],
      ["largura_cm", "SELLER_PACKAGE_WIDTH", "Largura"],
      ["comprimento_cm", "SELLER_PACKAGE_LENGTH", "Comprimento"],
    ] as const
  ).map(([column, attribute, label]) => ({
    column,
    attribute,
    label,
    unit: "cm" as const,
    unitName: "centímetros",
    maximum: MAX_PACKAGE_CENTIMETERS,
  })),
];

const GTIN_COLUMN = { column: "gtin", attribute: "GTIN", label: "GTIN" } as const;

export const PRODUCT_CSV_ATTRIBUTE_COLUMNS: readonly string[] = [
  ...TEXT_COLUMNS.map((entry) => entry.column),
  GTIN_COLUMN.column,
  ...MEASURE_COLUMNS.map((entry) => entry.column),
];

const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/** GS1 check digit: weights 3 and 1 alternate from the digit before the check digit. */
export function isValidGtin(value: string): boolean {
  if (!/^\d+$/.test(value) || !GTIN_LENGTHS.has(value.length)) {
    return false;
  }
  // Digits only (checked above), so splitting by character is safe.
  const digits = value.split("").map(Number);
  const check = digits.pop();
  const sum = digits
    .toReversed()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** "32,5" or "32.5", above zero, at most one decimal place; null otherwise. */
function parseMeasure(input: string, maximum: number): number | null {
  if (!/^\d+(?:[,.]\d)?$/.test(input)) {
    return null;
  }
  const value = Number(input.replace(",", "."));
  return value > 0 && value <= maximum ? value : null;
}

type AttributeResult = { attributes: Record<string, string> } | { reason: string };

function textAttribute(entry: TextColumn, value: string): AttributeResult {
  if (value.length > MAX_ATTRIBUTE_LENGTH) {
    return { reason: `${entry.label}: até ${MAX_ATTRIBUTE_LENGTH} caracteres` };
  }
  return { attributes: { [entry.attribute]: value } };
}

function gtinAttribute(value: string): AttributeResult {
  if (!isValidGtin(value)) {
    return {
      reason: `GTIN: "${value}" não é um código de barras válido (8, 12, 13 ou 14 dígitos com dígito verificador)`,
    };
  }
  return { attributes: { [GTIN_COLUMN.attribute]: value } };
}

function measureAttribute(entry: MeasureColumn, value: string): AttributeResult {
  const measure = parseMeasure(value, entry.maximum);
  if (measure === null) {
    return {
      reason: `${entry.label}: "${value}" deve ser um número em ${entry.unitName}, acima de 0 e até ${entry.maximum}`,
    };
  }
  return { attributes: { [entry.attribute]: `${measure} ${entry.unit}` } };
}

function attributeFor(column: string, value: string): AttributeResult {
  const text = TEXT_COLUMNS.find((entry) => entry.column === column);
  if (text !== undefined) {
    return textAttribute(text, value);
  }
  const measure = MEASURE_COLUMNS.find((entry) => entry.column === column);
  if (measure !== undefined) {
    return measureAttribute(measure, value);
  }
  return gtinAttribute(value);
}

/**
 * The attributes of one CSV line, keyed by Mercado Livre id. Blank cells are left out, so an
 * update keeps the value the product already has. Every bad cell is named, joined by "; ", so
 * one round of fixes clears the line.
 */
export function parseCsvAttributes(values: Readonly<Record<string, string>>): AttributeResult {
  const results = PRODUCT_CSV_ATTRIBUTE_COLUMNS.flatMap((column) => {
    const value = (values[column] ?? "").trim();
    return value === "" ? [] : [attributeFor(column, value)];
  });
  const failures = results.flatMap((result) => ("reason" in result ? [result.reason] : []));
  if (failures.length > 0) {
    return { reason: failures.join("; ") };
  }
  return {
    attributes: Object.assign(
      {},
      ...results.map((result) => ("attributes" in result ? result.attributes : {})),
    ),
  };
}
