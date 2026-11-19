import { notFoundError } from "@sellbridge/shared/errors";
import { toPaginated } from "@sellbridge/shared/schemas";
import type {
  CatalogListSearch,
  CatalogProductRef,
  CatalogSortColumn,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import {
  evaluateCompleteness,
  requiredAttributesFor,
  type CompletenessReport,
} from "@sellbridge/shared/supplier-panel-catalog-completeness";
import {
  PRODUCT_REVIEW_STATUSES,
  type ProductReviewStatus,
} from "@sellbridge/shared/supplier-panel-catalog-status";
import {
  readProductFiscal,
  withFiscalFallback,
  type FiscalFallback,
} from "@sellbridge/shared/product-fiscal";
import { and, asc, desc, eq, gt, sql, type AnyColumn } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../client.ts";
import {
  categories,
  listings,
  orderItems,
  productModelColors,
  productModels,
  productModelSizes,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";

/** The columns the list filters read, on the products table or an alias of it. */
interface ProductTable {
  readonly supplierId: AnyColumn;
  readonly reviewStatus: AnyColumn;
  readonly sku: AnyColumn;
  readonly title: AnyColumn;
  readonly fiscal: AnyColumn;
}
import type { ProductExportSource } from "@sellbridge/shared/supplier-panel-export";
import { matchesEveryWord } from "./sql/search-pattern.ts";
import { getSupplierFiscalFallback } from "./supplier-brand.ts";

export type SupplierPanelProductRow = typeof supplierProducts.$inferSelect;

/** A supplier's product as the panel shows it, with how ready it is to be sold. */
export interface SupplierPanelProduct extends SupplierPanelProductRow {
  categoryName: string | null;
  categorySlug: string | null;
  completeness: CompletenessReport;
}

/** A row of the panel list: `deletable` while no reseller ever published or sold it. */
/** A colour and size grid, shown once in the list for all its combinations. */
export interface PanelListGrid {
  readonly modelId: string;
  readonly title: string;
  readonly colors: number;
  readonly sizes: number;
  readonly combinations: number;
  readonly stock: number;
}

export interface SupplierPanelListProduct extends SupplierPanelProduct {
  deletable: boolean;
  /** Set on the row that stands for a whole grid; null for a product of its own. */
  grid: PanelListGrid | null;
}

/**
 * No listing and no order item points at the product: deleting it leaves no reseller listing
 * or sale history behind. Everything else can only go off sale.
 */
export const neverListedNorSold = sql<boolean>`not exists (select 1 from ${listings} where ${listings.supplierProductId} = ${supplierProducts.id}) and not exists (select 1 from ${orderItems} where ${orderItems.supplierProductId} = ${supplierProducts.id})`;

export type SupplierPanelStatusCounts = Record<ProductReviewStatus | "all", number>;

/**
 * A product whose NF-e cannot be issued yet: no NCM, or no origin or unit while Marca has none
 * to lend it either.
 */
function missingFiscalData(
  fallback: FiscalFallback | null,
  products: ProductTable = supplierProducts,
) {
  const noNcm = sql<boolean>`${products.fiscal} ->> 'ncm' is null`;
  if (fallback !== null) {
    return noNcm;
  }
  return sql<boolean>`(${noNcm} or ${products.fiscal} ->> 'origin' is null or ${products.fiscal} ->> 'unit' is null)`;
}

async function countMissingFiscal(
  database: DatabaseExecutor,
  supplierId: string,
  fallback: FiscalFallback | null,
): Promise<number> {
  const [row] = await database
    // A grid counts once, like the row that stands for it in the list.
    .select({
      value: sql<number>`count(distinct coalesce(${supplierProducts.modelId}, ${supplierProducts.id}))::int`,
    })
    .from(supplierProducts)
    .where(and(eq(supplierProducts.supplierId, supplierId), missingFiscalData(fallback)));
  return row?.value ?? 0;
}

const SORT_COLUMNS: Readonly<Record<CatalogSortColumn, AnyColumn>> = {
  title: supplierProducts.title,
  sku: supplierProducts.sku,
  stock: supplierProducts.stock,
  costCents: supplierProducts.costCents,
  updatedAt: supplierProducts.updatedAt,
};

export const panelProductColumns = {
  product: supplierProducts,
  categoryName: categories.name,
  categorySlug: categories.slug,
};

export function withPanelCompleteness(
  row: {
    product: SupplierPanelProductRow;
    categoryName: string | null;
    categorySlug: string | null;
  },
  fiscalFallback: FiscalFallback | null = null,
): SupplierPanelProduct {
  return {
    ...row.product,
    categoryName: row.categoryName,
    categorySlug: row.categorySlug,
    completeness: evaluateCompleteness(
      {
        ...row.product,
        fiscal: withFiscalFallback(readProductFiscal(row.product.fiscal), fiscalFallback),
      },
      requiredAttributesFor(row.categorySlug),
    ),
  };
}

export async function assertPanelSupplier(
  database: DatabaseExecutor,
  supplierId: string,
): Promise<void> {
  const [supplier] = await database
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId));
  if (supplier === undefined) {
    throw notFoundError(`Fornecedor ${supplierId} não encontrado`);
  }
}

async function countByStatus(
  database: DatabaseExecutor,
  supplierId: string,
  filters: {
    query: string | undefined;
    onlyMissingFiscal: boolean;
    fiscalFallback: FiscalFallback | null;
  },
): Promise<SupplierPanelStatusCounts> {
  const { query, onlyMissingFiscal, fiscalFallback } = filters;
  const rows = await database
    // A grid counts once, like the row that stands for it.
    .select({
      status: supplierProducts.reviewStatus,
      value: sql<number>`count(distinct coalesce(${supplierProducts.modelId}, ${supplierProducts.id}))::int`,
    })
    .from(supplierProducts)
    .where(
      and(
        eq(supplierProducts.supplierId, supplierId),
        query === undefined
          ? undefined
          : matchesEveryWord(query, [supplierProducts.sku, supplierProducts.title]),
        onlyMissingFiscal ? missingFiscalData(fiscalFallback) : undefined,
      ),
    )
    .groupBy(supplierProducts.reviewStatus);
  const byStatus = new Map(rows.map((row) => [row.status, row.value]));
  const of = (status: ProductReviewStatus) => byStatus.get(status) ?? 0;
  return {
    all: PRODUCT_REVIEW_STATUSES.reduce((sum, status) => sum + of(status), 0),
    draft: of("draft"),
    in_review: of("in_review"),
    approved: of("approved"),
    rejected: of("rejected"),
  };
}

/** The list's filters over one supplier's products: status tab, search, missing fiscal data. */
function panelListCondition(
  input: Pick<CatalogListSearch, "status" | "query" | "fiscal"> & { supplierId: string },
  fiscalFallback: FiscalFallback | null,
  products: ProductTable = supplierProducts,
) {
  return and(
    eq(products.supplierId, input.supplierId),
    input.status === "all" ? undefined : eq(products.reviewStatus, input.status),
    input.query === undefined
      ? undefined
      : matchesEveryWord(input.query, [products.sku, products.title]),
    input.fiscal === "missing" ? missingFiscalData(fiscalFallback, products) : undefined,
  );
}

const gridCombination = alias(supplierProducts, "grid_combination");

/**
 * A grid shows in the list once, through its first combination (in id order) that matches the
 * same filters; a product of its own always shows.
 */
function onceForItsGrid(
  input: Pick<CatalogListSearch, "status" | "query" | "fiscal"> & { supplierId: string },
  fiscalFallback: FiscalFallback | null,
) {
  return sql`(${supplierProducts.modelId} is null or ${supplierProducts.id} = (select ${gridCombination.id} from ${supplierProducts} ${gridCombination} where ${gridCombination.modelId} = ${supplierProducts.modelId} and ${panelListCondition(input, fiscalFallback, gridCombination)} order by ${gridCombination.id} limit 1))`;
}

/** What the grid row shows: the model's name, its options and the stock of all combinations. */
const gridSummaryColumns = {
  gridTitle: sql<
    string | null
  >`(select ${productModels.title} from ${productModels} where ${productModels.id} = ${supplierProducts.modelId})`,
  gridColors: sql<number>`(select count(*)::int from ${productModelColors} where ${productModelColors.modelId} = ${supplierProducts.modelId})`,
  gridSizes: sql<number>`(select count(*)::int from ${productModelSizes} where ${productModelSizes.modelId} = ${supplierProducts.modelId})`,
  gridCombinations: sql<number>`(select count(*)::int from ${supplierProducts} ${gridCombination} where ${gridCombination.modelId} = ${supplierProducts.modelId} and ${gridCombination.active})`,
  gridStock: sql<number>`(select coalesce(sum(${gridCombination.stock}), 0)::int from ${supplierProducts} ${gridCombination} where ${gridCombination.modelId} = ${supplierProducts.modelId} and ${gridCombination.active})`,
};

function gridOf(row: {
  product: { modelId: string | null };
  gridTitle: string | null;
  gridColors: number;
  gridSizes: number;
  gridCombinations: number;
  gridStock: number;
}): PanelListGrid | null {
  if (row.product.modelId === null || row.gridTitle === null) {
    return null;
  }
  return {
    modelId: row.product.modelId,
    title: row.gridTitle,
    colors: row.gridColors,
    sizes: row.gridSizes,
    combinations: row.gridCombinations,
    stock: row.gridStock,
  };
}

/**
 * The supplier's products for the panel list: one status tab, search on SKU and title, any
 * column sorted either way, plus how many products each tab holds for the same search.
 */
export async function listSupplierPanelProducts(
  database: DatabaseExecutor,
  input: CatalogListSearch & { supplierId: string },
) {
  await assertPanelSupplier(database, input.supplierId);
  const fiscalFallback = await getSupplierFiscalFallback(database, input.supplierId);
  const condition = panelListCondition(input, fiscalFallback);
  const order = input.direction === "asc" ? asc : desc;
  const [rows, counts, missingFiscalCount] = await Promise.all([
    database
      .select({ ...panelProductColumns, ...gridSummaryColumns, deletable: neverListedNorSold })
      .from(supplierProducts)
      .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
      .where(and(condition, onceForItsGrid(input, fiscalFallback)))
      .orderBy(order(SORT_COLUMNS[input.sort]), asc(supplierProducts.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    countByStatus(database, input.supplierId, {
      query: input.query,
      onlyMissingFiscal: input.fiscal === "missing",
      fiscalFallback,
    }),
    countMissingFiscal(database, input.supplierId, fiscalFallback),
  ]);
  const pagination = { page: input.page, pageSize: input.pageSize };
  return {
    ...toPaginated(
      rows.map((row): SupplierPanelListProduct => ({
        ...withPanelCompleteness(row, fiscalFallback),
        deletable: row.deletable,
        grid: gridOf(row),
      })),
      counts[input.status],
      pagination,
    ),
    counts,
    missingFiscalCount,
    /** Marca has origin and unit, so a product only misses its NCM. */
    brandHasFiscalDefaults: fiscalFallback !== null,
  };
}

/** One of the supplier's products; another supplier's id reads as not found. */
export async function getSupplierPanelProduct(
  database: DatabaseExecutor,
  ref: CatalogProductRef,
): Promise<SupplierPanelProduct> {
  const [[row], fiscalFallback] = await Promise.all([
    database
      .select(panelProductColumns)
      .from(supplierProducts)
      .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
      .where(
        and(
          eq(supplierProducts.id, ref.productId),
          eq(supplierProducts.supplierId, ref.supplierId),
        ),
      ),
    getSupplierFiscalFallback(database, ref.supplierId),
  ]);
  if (row === undefined) {
    throw notFoundError(`Produto ${ref.productId} não encontrado neste fornecedor`);
  }
  return withPanelCompleteness(row, fiscalFallback);
}

export type SupplierCatalogExportFilter = Pick<CatalogListSearch, "status" | "query" | "fiscal"> & {
  supplierId: string;
};

const exportColumns = {
  sku: supplierProducts.sku,
  title: supplierProducts.title,
  description: supplierProducts.description,
  costCents: supplierProducts.costCents,
  suggestedPriceCents: supplierProducts.suggestedPriceCents,
  stock: supplierProducts.stock,
  categorySlug: categories.slug,
  imageUrls: supplierProducts.imageUrls,
  active: supplierProducts.active,
  mercadoLivreAttributes: supplierProducts.mercadoLivreAttributes,
  fiscal: supplierProducts.fiscal,
  modelCode: productModels.code,
  modelTitle: productModels.title,
  color: supplierProducts.color,
  size: supplierProducts.size,
};

/** A combination comes out with its model's code and title, its colour and its size. */
function exportSource(
  row: {
    modelCode: string | null;
    modelTitle: string | null;
    color: string | null;
    size: string | null;
  } & Omit<ProductExportSource, "grid">,
): ProductExportSource {
  const { modelCode, modelTitle, color, size, ...product } = row;
  return {
    ...product,
    grid: modelCode === null || modelTitle === null ? null : { modelCode, modelTitle, color, size },
  };
}

/**
 * The products the panel list shows with these filters, in SKU order, a batch at a time: the
 * spreadsheet export writes each batch as it arrives, so a large catalog never sits whole in
 * memory. Each batch starts after the last SKU of the one before (SKUs are unique per supplier).
 *
 * @throws {AppError} NOT_FOUND when the supplier does not exist.
 */
export async function* supplierCatalogExportBatches(
  database: DatabaseExecutor,
  filter: SupplierCatalogExportFilter,
  batchSize: number,
): AsyncGenerator<ProductExportSource[]> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error(`The export batch size must be a positive integer, got ${batchSize}`);
  }
  await assertPanelSupplier(database, filter.supplierId);
  const fiscalFallback = await getSupplierFiscalFallback(database, filter.supplierId);
  const condition = panelListCondition(filter, fiscalFallback);
  let afterSku: string | null = null;
  let batchWasFull = true;
  while (batchWasFull) {
    const rows: ProductExportSource[] = (
      await database
        .select(exportColumns)
        .from(supplierProducts)
        .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
        .leftJoin(productModels, eq(productModels.id, supplierProducts.modelId))
        .where(and(condition, afterSku === null ? undefined : gt(supplierProducts.sku, afterSku)))
        .orderBy(asc(supplierProducts.sku))
        .limit(batchSize)
    ).map(exportSource);
    if (rows.length > 0) {
      yield rows;
    }
    batchWasFull = rows.length === batchSize;
    afterSku = rows.at(-1)?.sku ?? afterSku;
  }
}
