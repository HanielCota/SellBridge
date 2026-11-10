/**
 * A product read from a supplier's ERP (Bling first), before it becomes a row of the product
 * import. The fiscal fields travel with it but do not reach the import yet: the product has no
 * fiscal columns until the fiscal-fields work adds them (then `toCsvFields` gains them too).
 */
export interface ErpCatalogItem {
  readonly sku: string;
  readonly title: string;
  readonly description: string;
  /** The ERP's sale price, in cents; it becomes the reseller's cost. Null when the ERP has none. */
  readonly priceCents: number | null;
  readonly stock: number;
  readonly imageUrls: readonly string[];
  readonly brand: string | null;
  readonly gtin: string | null;
  readonly weightGrams: number | null;
  readonly fiscal: ErpFiscalData;
}

export interface ErpFiscalData {
  /** NCM digits only (8 when valid); null when the ERP has none. */
  readonly ncm: string | null;
  /** Origin code 0 to 8 (SEFAZ table). */
  readonly origin: number | null;
  /** Commercial unit ("UN", "PAR"). */
  readonly unit: string | null;
  readonly cest: string | null;
}

const CSV_HEADER = [
  "sku",
  "titulo",
  "descricao",
  "custo",
  "estoque",
  "imagens",
  "ativo",
  "marca",
  "gtin",
  "peso_g",
] as const;

const GTIN_PATTERN = /^\d{8}$|^\d{12,14}$/;

function quoteCsv(value: string): string {
  return `"${value.replace(/\r\n?/g, "\n").replaceAll('"', '""')}"`;
}

/** "3990" cents → "39,90", the money format the product import reads. */
function formatCents(cents: number): string {
  const reais = Math.floor(cents / 100);
  const remainder = String(cents % 100).padStart(2, "0");
  return `${reais},${remainder}`;
}

function priceCell(priceCents: number | null): string {
  if (priceCents === null || !Number.isInteger(priceCents) || priceCents <= 0) {
    return "";
  }
  return formatCents(priceCents);
}

/** An ERP may hold a negative balance (sold before restocking); the catalog shows none left. */
function stockCell(stock: number): string {
  if (!Number.isFinite(stock) || stock <= 0) {
    return "0";
  }
  return String(Math.floor(stock));
}

/** ERPs write "SEM GTIN" or leave junk: only a barcode-shaped value is sent to the import. */
function gtinCell(gtin: string | null): string {
  if (gtin === null) {
    return "";
  }
  const digits = gtin.trim();
  return GTIN_PATTERN.test(digits) ? digits : "";
}

function weightCell(weightGrams: number | null): string {
  if (weightGrams === null || !Number.isFinite(weightGrams) || weightGrams <= 0) {
    return "";
  }
  return String(Math.round(weightGrams));
}

function toCsvFields(item: ErpCatalogItem): string[] {
  return [
    item.sku,
    item.title,
    item.description,
    priceCell(item.priceCents),
    stockCell(item.stock),
    item.imageUrls.join("|"),
    "sim",
    item.brand ?? "",
    gtinCell(item.gtin),
    weightCell(item.weightGrams),
  ];
}

/**
 * The ERP catalog as a product import file (";" separated, quoted cells), so it goes through the
 * same preview, rules and confirmation as a spreadsheet the supplier uploads.
 */
export function buildErpCatalogCsv(items: readonly ErpCatalogItem[]): string {
  const lines = [
    CSV_HEADER.join(";"),
    ...items.map((item) => toCsvFields(item).map(quoteCsv).join(";")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
