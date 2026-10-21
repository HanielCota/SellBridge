import { validationError } from "../runtime/errors.ts";
import type { XlsxSheet } from "../runtime/xlsx-reader.ts";
import { MAX_PRODUCT_CSV_BYTES, MAX_PRODUCT_CSV_ROWS } from "../schemas/admin-suppliers.ts";

/**
 * Turns supplier spreadsheets into the product CSV accepted by the admin import.
 * The supplier catalog (EnvioVelox export) is the source of SKU, cost and stock.
 * A Shopee listing export is optional: matched by SKU, it supplies the suggested price,
 * the marketplace title, description and extra images.
 */

export type SpreadsheetKind = "supplier-catalog" | "shopee-listings";

export interface SpreadsheetRow {
  /** Row number as shown by the spreadsheet application. */
  readonly rowNumber: number;
  readonly values: ReadonlyMap<string, string>;
}

export interface DetectedSpreadsheet {
  readonly kind: SpreadsheetKind;
  readonly source: string;
  readonly headers: readonly string[];
  readonly rows: readonly SpreadsheetRow[];
}

export interface CatalogCategory {
  readonly name: string;
  readonly slug: string;
}

export interface CatalogSourceLine {
  /** First physical line of the record in the generated CSV. */
  readonly csvLine: number;
  readonly source: string;
  readonly rowNumber: number;
  readonly sku: string;
}

export interface CatalogImport {
  readonly csv: string;
  readonly productCount: number;
  readonly enrichedCount: number;
  /** Shopee SKUs without a supplier product: they cannot be imported without cost and stock. */
  readonly unmatchedListingSkus: readonly string[];
  readonly lines: readonly CatalogSourceLine[];
}

export const SPREADSHEET_KIND_LABEL: Record<SpreadsheetKind, string> = {
  "supplier-catalog": "Catálogo do fornecedor",
  "shopee-listings": "Anúncios da Shopee",
};

const HEADER_SEARCH_ROWS = 10;
const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 20_000;
const MAX_IMAGES = 20;
const MAX_CENTS = 2_147_483_647;
const SINGLE_SIZE = new Set(["unico", "u", "un", "tamanho unico"]);

const SPREADSHEET_KINDS: readonly SpreadsheetKind[] = ["supplier-catalog", "shopee-listings"];
const REQUIRED_HEADERS: Record<SpreadsheetKind, readonly string[]> = {
  "supplier-catalog": ["sku", "nome produto", "preco de venda", "estoque"],
  "shopee-listings": ["nome do produto", "sku da variacao", "preco"],
};

const CSV_HEADER = ["sku", "titulo", "descricao", "custo", "estoque", "categoria", "imagens"];

export function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(text: string): string {
  return normalizeHeader(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const isBlank = (value: string | undefined): boolean => value == null || value.trim().length === 0;

function detectKind(headers: readonly string[]): SpreadsheetKind | null {
  const present = new Set(headers);
  return (
    SPREADSHEET_KINDS.find((kind) =>
      REQUIRED_HEADERS[kind].every((header) => present.has(header)),
    ) ?? null
  );
}

/** Finds the header row among the first rows of a sheet and recognizes its layout. */
export function detectSpreadsheet(sheet: XlsxSheet, fileName: string): DetectedSpreadsheet | null {
  const searchLimit = Math.min(sheet.rows.length, HEADER_SEARCH_ROWS);
  for (let headerIndex = 0; headerIndex < searchLimit; headerIndex += 1) {
    const headers = (sheet.rows[headerIndex] ?? []).map(normalizeHeader);
    const kind = detectKind(headers);
    if (kind == null) {
      continue;
    }

    const rows = sheet.rows.slice(headerIndex + 1).flatMap((cells, offset) => {
      if (cells.every((cell) => isBlank(cell))) {
        return [];
      }

      const values = new Map(
        headers.map((header, column) => [header, (cells[column] ?? "").trim()]),
      );
      return [{ rowNumber: headerIndex + offset + 2, values }];
    });
    return { kind, source: `${fileName} › ${sheet.name}`, headers, rows };
  }
  return null;
}

function parseDecimal(text: string): number | null {
  const normalized = text.replace(/[R$\s]/g, "").replace(",", ".");
  if (normalized.length === 0) {
    return null;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return null;
  }

  return value;
}

/** Spreadsheet money arrives as binary floats (14.699999); round once to cents at the boundary. */
function toCents(text: string): number | null {
  const value = parseDecimal(text);
  if (value == null || value < 0) {
    return null;
  }

  const cents = Math.round(value * 100);
  if (cents > MAX_CENTS) {
    return null;
  }

  return cents;
}

function formatMoney(cents: number): string {
  return `${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}

/** Invalid values pass through unchanged so the CSV validation reports them on the right line. */
function moneyField(text: string): string {
  const cents = toCents(text);
  if (cents == null) {
    return text;
  }
  return formatMoney(cents);
}

function stockField(text: string): string {
  const value = parseDecimal(text);
  if (value == null || value < 0 || !Number.isInteger(value)) {
    return text;
  }
  return String(value);
}

function supplierCost(values: ReadonlyMap<string, string>): string {
  const cost = toCents(values.get("preco de custo") ?? "");
  if (cost != null && cost > 0) {
    return formatMoney(cost);
  }
  return moneyField(values.get("preco de venda") ?? "");
}

function numberedHeaders(headers: readonly string[], pattern: RegExp): string[] {
  return headers
    .flatMap((header) => {
      const position = pattern.exec(header)?.[1];
      return position == null ? [] : [{ header, position: Number.parseInt(position, 10) }];
    })
    .toSorted((first, second) => first.position - second.position)
    .map((entry) => entry.header);
}

function imagesFrom(values: ReadonlyMap<string, string>, headers: readonly string[]): string[] {
  return headers
    .map((header) => values.get(header) ?? "")
    .filter((url) => /^https?:\/\//i.test(url));
}

function supplierTitle(values: ReadonlyMap<string, string>): string {
  const variant = [values.get("cor") ?? "", values.get("tamanho") ?? ""].filter(
    (part) => !isBlank(part) && !SINGLE_SIZE.has(normalizeHeader(part)),
  );
  const name = values.get("nome produto") ?? "";
  if (variant.length === 0) {
    return name;
  }
  return `${name} - ${variant.join(" ")}`;
}

function listingTitle(values: ReadonlyMap<string, string>): string {
  const name = values.get("nome do produto") ?? "";
  const variant = (values.get("nome da variacao") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (variant.length === 0) {
    return name;
  }
  return `${name} - ${variant.join(" ")}`;
}

function resolveCategory(
  values: ReadonlyMap<string, string>,
  categories: readonly CatalogCategory[],
): string {
  const bySlug = new Map(
    categories.flatMap((category) => [
      [category.slug, category.slug],
      [slugify(category.name), category.slug],
    ]),
  );
  const candidates = [values.get("categoria filho") ?? "", values.get("categoria pai") ?? ""];
  for (const candidate of candidates) {
    if (isBlank(candidate)) {
      continue;
    }

    const slug = bySlug.get(slugify(candidate));
    if (slug != null) {
      return slug;
    }
  }
  return "";
}

interface Listing {
  readonly values: ReadonlyMap<string, string>;
  readonly images: readonly string[];
}

/** Products without variations only fill the reference SKU. */
function listingSku(values: ReadonlyMap<string, string>): string | null {
  const variationSku = values.get("sku da variacao") ?? "";
  if (!isBlank(variationSku)) {
    return variationSku;
  }

  const referenceSku = values.get("sku de referencia") ?? "";
  return isBlank(referenceSku) ? null : referenceSku;
}

function indexListings(sheets: readonly DetectedSpreadsheet[]): Map<string, Listing> {
  const listings = new Map<string, Listing>();
  for (const sheet of sheets) {
    const imageHeaders = [
      "imagem de capa [midia]",
      ...numberedHeaders(sheet.headers, /^imagem do produto (\d+) \[midia\]$/),
    ];
    for (const row of sheet.rows) {
      const sku = listingSku(row.values);
      if (sku == null || listings.has(sku)) {
        continue;
      }

      listings.set(sku, { values: row.values, images: imagesFrom(row.values, imageHeaders) });
    }
  }
  return listings;
}

function quoteCsv(value: string): string {
  return `"${value.replace(/\r\n?/g, "\n").replaceAll('"', '""')}"`;
}

function buildRecord(
  row: SpreadsheetRow,
  context: {
    imageHeaders: readonly string[];
    listing: Listing | undefined;
    categories: readonly CatalogCategory[];
  },
): string[] {
  const { values } = row;
  const { listing } = context;
  const listingDescription = listing?.values.get("descricao do produto [basico]") ?? "";
  const description = isBlank(listingDescription)
    ? (values.get("descricao") ?? "")
    : listingDescription;
  const title = listing == null ? supplierTitle(values) : listingTitle(listing.values);
  const images = [...imagesFrom(values, context.imageHeaders), ...(listing?.images ?? [])];
  const price = toCents(listing?.values.get("preco") ?? "");
  return [
    values.get("sku") ?? "",
    title.slice(0, MAX_TITLE_LENGTH),
    description.slice(0, MAX_DESCRIPTION_LENGTH),
    supplierCost(values),
    stockField(values.get("estoque") ?? ""),
    resolveCategory(values, context.categories),
    [...new Set(images)].slice(0, MAX_IMAGES).join("|"),
    price == null || price === 0 ? "" : formatMoney(price),
  ];
}

export function buildCatalogImport(input: {
  sheets: readonly DetectedSpreadsheet[];
  categories: readonly CatalogCategory[];
}): CatalogImport {
  const catalogs = input.sheets.filter((sheet) => sheet.kind === "supplier-catalog");
  if (catalogs.length === 0) {
    throw validationError(
      "Envie também a planilha de produtos do fornecedor (com SKU, Nome produto, Preço de venda e Estoque)",
    );
  }

  const listings = indexListings(input.sheets.filter((sheet) => sheet.kind === "shopee-listings"));
  const records: string[] = [[...CSV_HEADER, "preco_sugerido"].join(";")];
  const lines: CatalogSourceLine[] = [];
  const importedSkus = new Set<string>();
  let csvLine = 2;
  let enrichedCount = 0;
  for (const catalog of catalogs) {
    const imageHeaders = numberedHeaders(catalog.headers, /^url imagem (\d+)$/);
    for (const row of catalog.rows) {
      const sku = row.values.get("sku") ?? "";
      const listing = listings.get(sku);
      const fields = buildRecord(row, { imageHeaders, listing, categories: input.categories });
      const record = fields.map(quoteCsv).join(";");
      records.push(record);
      lines.push({ csvLine, source: catalog.source, rowNumber: row.rowNumber, sku });
      csvLine += 1 + (record.match(/\n/g)?.length ?? 0);
      importedSkus.add(sku);
      enrichedCount += listing == null ? 0 : 1;
    }
  }

  if (lines.length === 0) {
    throw validationError("A planilha do fornecedor não contém produtos");
  }

  if (lines.length > MAX_PRODUCT_CSV_ROWS) {
    throw validationError(
      `A importação aceita no máximo ${MAX_PRODUCT_CSV_ROWS} produtos por vez. Divida a planilha do fornecedor`,
    );
  }

  const csv = `${records.join("\r\n")}\r\n`;
  if (new TextEncoder().encode(csv).byteLength > MAX_PRODUCT_CSV_BYTES) {
    throw validationError(
      "Os produtos convertidos passam de 2 MiB. Divida a planilha do fornecedor em partes menores",
    );
  }

  return {
    csv,
    productCount: lines.length,
    enrichedCount,
    unmatchedListingSkus: [...listings.keys()].filter((sku) => !importedSkus.has(sku)).toSorted(),
    lines,
  };
}

/** Translates a CSV line from the import preview back to the spreadsheet row it came from. */
export function findSourceLine(
  lines: readonly CatalogSourceLine[],
  csvLine: number,
): CatalogSourceLine | null {
  let found: CatalogSourceLine | null = null;
  for (const line of lines) {
    if (line.csvLine > csvLine) {
      break;
    }
    found = line;
  }
  return found;
}
