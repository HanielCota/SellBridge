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
import { and, asc, count, desc, eq, gt, sql, type AnyColumn } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { categories, listings, orderItems, supplierProducts, suppliers } from "../schema/index.ts";
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
export interface SupplierPanelListProduct extends SupplierPanelProduct {
  deletable: boolean;
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
function missingFiscalData(fallback: FiscalFallback | null) {
  const noNcm = sql<boolean>`${supplierProducts.fiscal} ->> 'ncm' is null`;
  if (fallback !== null) {
    return noNcm;
  }
  return sql<boolean>`(${noNcm} or ${supplierProducts.fiscal} ->> 'origin' is null or ${supplierProducts.fiscal} ->> 'unit' is null)`;
}

async function countMissingFiscal(
  database: DatabaseExecutor,
  supplierId: string,
  fallback: FiscalFallback | null,
): Promise<number> {
  const [row] = await database
    .select({ value: count() })
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
    .select({ status: supplierProducts.reviewStatus, value: count() })
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
) {
  return and(
    eq(supplierProducts.supplierId, input.supplierId),
    input.status === "all" ? undefined : eq(supplierProducts.reviewStatus, input.status),
    input.query === undefined
      ? undefined
      : matchesEveryWord(input.query, [supplierProducts.sku, supplierProducts.title]),
    input.fiscal === "missing" ? missingFiscalData(fiscalFallback) : undefined,
  );
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
      .select({ ...panelProductColumns, deletable: neverListedNorSold })
      .from(supplierProducts)
      .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
      .where(condition)
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
};

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
    const rows: ProductExportSource[] = await database
      .select(exportColumns)
      .from(supplierProducts)
      .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
      .where(and(condition, afterSku === null ? undefined : gt(supplierProducts.sku, afterSku)))
      .orderBy(asc(supplierProducts.sku))
      .limit(batchSize);
    if (rows.length > 0) {
      yield rows;
    }
    batchWasFull = rows.length === batchSize;
    afterSku = rows.at(-1)?.sku ?? afterSku;
  }
}
