import { z } from "zod";
import {
  cestSchema,
  isNoGtin,
  ncmSchema,
  NO_GTIN,
  productOriginSchema,
  productUnitSchema,
} from "./product-fiscal.ts";

/**
 * A product read from a supplier's ERP (Bling first), before it becomes a row of the product
 * import. Its NCM, origin, unit and CEST go into the import's fiscal columns when they pass the
 * same rules as a typed value; one that does not is left blank instead of refusing the line.
 */
export interface ErpCatalogItem {
  readonly sku: string;
  readonly title: string;
  readonly description: string;
  /**
   * The ERP's sale price, in cents. Most likely the retail price (StockShopp's Bling holds its
   * marketplace prices), so it becomes the suggested price, never the reseller's cost. Null when
   * the ERP has none.
   */
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
  "preco_sugerido",
  "marca",
  "gtin",
  "peso_g",
  "categoria",
  "ncm",
  "origem",
  "unidade",
  "cest",
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
  if (isNoGtin(gtin)) {
    return NO_GTIN;
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

/** A positive whole number of cents, or null for anything else (zero, negative, NaN, fraction). */
function validCents(cents: number | null): number | null {
  if (cents === null || !Number.isInteger(cents) || cents <= 0) {
    return null;
  }
  return cents;
}

/**
 * What a product SellBridge already has keeps when the ERP leaves it blank: the import writes
 * category, photos and description as they come, so a blank cell would wipe them.
 */
export interface ErpKeptFields {
  readonly categorySlug: string | null;
  readonly imageUrls: readonly string[];
  readonly description: string;
}

function toCsvFields(
  item: ErpCatalogItem,
  resellerCostCents: number | undefined,
  kept: ErpKeptFields | undefined,
): string[] {
  const description = item.description === "" ? (kept?.description ?? "") : item.description;
  const imageUrls = item.imageUrls.length === 0 ? (kept?.imageUrls ?? []) : item.imageUrls;
  return [
    item.sku,
    item.title,
    description,
    priceCell(resellerCostCents ?? null),
    stockCell(item.stock),
    imageUrls.join("|"),
    // Blank keeps what SellBridge has (a product taken off sale stays off); a new one goes on sale.
    "",
    priceCell(item.priceCents),
    item.brand ?? "",
    gtinCell(item.gtin),
    weightCell(item.weightGrams),
    // The ERP has no SellBridge category: an existing product keeps its own, a new one has none.
    kept?.categorySlug ?? "",
    ...fiscalCells(item.fiscal),
  ];
}

/** A value the import would refuse is sent blank: the product then waits for it as a draft. */
function validOrBlank(schema: z.ZodType, value: unknown): string {
  const parsed = schema.safeParse(value);
  return parsed.success ? String(parsed.data) : "";
}

function fiscalCells(fiscal: ErpFiscalData): string[] {
  return [
    validOrBlank(ncmSchema, fiscal.ncm),
    validOrBlank(productOriginSchema, fiscal.origin),
    validOrBlank(productUnitSchema, fiscal.unit?.trim().toUpperCase()),
    validOrBlank(cestSchema, fiscal.cest),
  ];
}

/**
 * The ERP catalog as a product import file (";" separated, quoted cells), so it goes through the
 * same preview, rules and confirmation as a spreadsheet the supplier uploads. The reseller's cost
 * comes from `resellerCosts` (by SKU); the ERP price is only the suggested price. An item with no
 * cost there gets a blank cost, which the import refuses: it is never saved with a wrong price.
 * Products SellBridge already has keep their category, and their photos and description when the
 * ERP has none (`keptFields`, by SKU).
 */
export function buildErpCatalogCsv(
  items: readonly ErpCatalogItem[],
  resellerCosts: ReadonlyMap<string, number>,
  keptFields: ReadonlyMap<string, ErpKeptFields> = new Map(),
): string {
  const lines = [
    CSV_HEADER.join(";"),
    ...items.map((item) =>
      toCsvFields(item, resellerCosts.get(item.sku), keptFields.get(item.sku))
        .map(quoteCsv)
        .join(";"),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/** One ERP product as the import screen lists it, with what still needs the supplier. */
export interface ErpImportRow {
  readonly sku: string;
  readonly title: string;
  readonly imageUrl: string | null;
  /** The ERP price in cents (shown as the suggested retail price); null when it is not valid. */
  readonly erpPriceCents: number | null;
  /** What the reseller pays today in SellBridge; null for a product SellBridge does not have. */
  readonly currentCostCents: number | null;
  /** A new product: the supplier types the reseller price before it can be imported. */
  readonly needsCost: boolean;
}

/**
 * How each ERP product enters the import: a product the supplier already has keeps the reseller
 * cost it has today; a new one waits for the supplier to type it.
 */
export function planErpCatalogImport(
  items: readonly ErpCatalogItem[],
  existingCosts: ReadonlyMap<string, number>,
): ErpImportRow[] {
  return items.map((item) => {
    const currentCostCents = existingCosts.get(item.sku) ?? null;
    return {
      sku: item.sku,
      title: item.title,
      imageUrl: item.imageUrls[0] ?? null,
      erpPriceCents: validCents(item.priceCents),
      currentCostCents,
      needsCost: currentCostCents === null,
    };
  });
}

/** Parents read per import: about six minutes at the ERP's 3 requests per second. */
export const MAX_ERP_READ_PRODUCTS = 1000;
/** Items kept from one read (variations count one each), so a stored read stays bounded. */
export const MAX_ERP_READ_ITEMS = 3000;
const MAX_RESELLER_COST_CENTS = 100_000_000;

const nullableText = (max: number) => z.string().max(max).nullable();

/** An ERP product as a catalog read stores it; the product import still checks every rule. */
export const erpCatalogItemSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  title: z.string().max(500),
  description: z.string().max(50_000),
  priceCents: z.number().int().nullable(),
  stock: z.number().finite(),
  imageUrls: z.array(z.string().max(2000)).max(20),
  brand: nullableText(200),
  gtin: nullableText(50),
  weightGrams: z.number().finite().nullable(),
  fiscal: z.object({
    ncm: nullableText(20),
    origin: z.number().int().nullable(),
    unit: nullableText(20),
    cest: nullableText(20),
  }),
});

/** The reseller prices the supplier typed for new products, in cents. */
export const erpResellerCostsSchema = z
  .array(
    z.object({
      sku: z.string().trim().min(1).max(100),
      costCents: z
        .number()
        .int("O preço para o revendedor precisa ter até 2 casas decimais")
        .min(1, "Informe o preço para o revendedor (acima de R$ 0,00)")
        .max(MAX_RESELLER_COST_CENTS, "O preço para o revendedor pode ser de até R$ 1.000.000,00"),
    }),
  )
  .max(MAX_ERP_READ_ITEMS);

export type ErpResellerCost = z.infer<typeof erpResellerCostsSchema>[number];

/**
 * The reseller cost of every product that has one: the current cost of products SellBridge has,
 * plus the prices typed for new ones. A typed price only counts for a new product of this import.
 */
export function mergeResellerCosts(input: {
  items: readonly ErpCatalogItem[];
  existingCosts: ReadonlyMap<string, number>;
  typedCosts: readonly ErpResellerCost[];
}): { ok: true; costs: Map<string, number> } | { ok: false; message: string } {
  const importSkus = new Set(input.items.map((item) => item.sku));
  const costs = new Map(input.existingCosts);
  const typedSkus = new Set<string>();
  for (const typed of input.typedCosts) {
    if (!importSkus.has(typed.sku)) {
      return { ok: false, message: `O SKU "${typed.sku}" não está nesta importação.` };
    }
    if (input.existingCosts.has(typed.sku) || typedSkus.has(typed.sku)) {
      return {
        ok: false,
        message: `O SKU "${typed.sku}" já tem preço para o revendedor nesta importação.`,
      };
    }
    typedSkus.add(typed.sku);
    costs.set(typed.sku, typed.costCents);
  }
  return { ok: true, costs };
}

/** A stored catalog read, validated whenever it is read back from the database. */
export const erpCatalogReadResultSchema = z.object({
  items: z.array(erpCatalogItemSchema).max(MAX_ERP_READ_ITEMS),
  skipped: z
    .array(z.object({ name: z.string().max(500), reason: z.string().max(500) }))
    .max(MAX_ERP_READ_ITEMS),
  truncated: z.boolean(),
});

export type ErpCatalogReadResult = z.infer<typeof erpCatalogReadResultSchema>;
