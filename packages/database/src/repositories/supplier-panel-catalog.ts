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
import { and, asc, count, desc, eq, type AnyColumn } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { categories, supplierProducts, suppliers } from "../schema/index.ts";
import { matchesEveryWord } from "./sql/search-pattern.ts";

export type SupplierPanelProductRow = typeof supplierProducts.$inferSelect;

/** A supplier's product as the panel shows it, with how ready it is to be sold. */
export interface SupplierPanelProduct extends SupplierPanelProductRow {
  categoryName: string | null;
  categorySlug: string | null;
  completeness: CompletenessReport;
}

export type SupplierPanelStatusCounts = Record<ProductReviewStatus | "all", number>;

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

export function withPanelCompleteness(row: {
  product: SupplierPanelProductRow;
  categoryName: string | null;
  categorySlug: string | null;
}): SupplierPanelProduct {
  return {
    ...row.product,
    categoryName: row.categoryName,
    categorySlug: row.categorySlug,
    completeness: evaluateCompleteness(row.product, requiredAttributesFor(row.categorySlug)),
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
  query: string | undefined,
): Promise<SupplierPanelStatusCounts> {
  const rows = await database
    .select({ status: supplierProducts.reviewStatus, value: count() })
    .from(supplierProducts)
    .where(
      and(
        eq(supplierProducts.supplierId, supplierId),
        query === undefined
          ? undefined
          : matchesEveryWord(query, [supplierProducts.sku, supplierProducts.title]),
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

/**
 * The supplier's products for the panel list: one status tab, search on SKU and title, any
 * column sorted either way, plus how many products each tab holds for the same search.
 */
export async function listSupplierPanelProducts(
  database: DatabaseExecutor,
  input: CatalogListSearch & { supplierId: string },
) {
  await assertPanelSupplier(database, input.supplierId);
  const condition = and(
    eq(supplierProducts.supplierId, input.supplierId),
    input.status === "all" ? undefined : eq(supplierProducts.reviewStatus, input.status),
    input.query === undefined
      ? undefined
      : matchesEveryWord(input.query, [supplierProducts.sku, supplierProducts.title]),
  );
  const order = input.direction === "asc" ? asc : desc;
  const [total] = await database.select({ value: count() }).from(supplierProducts).where(condition);
  const rows = await database
    .select(panelProductColumns)
    .from(supplierProducts)
    .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
    .where(condition)
    .orderBy(order(SORT_COLUMNS[input.sort]), asc(supplierProducts.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const pagination = { page: input.page, pageSize: input.pageSize };
  return {
    ...toPaginated(rows.map(withPanelCompleteness), total?.value ?? 0, pagination),
    counts: await countByStatus(database, input.supplierId, input.query),
  };
}

/** One of the supplier's products; another supplier's id reads as not found. */
export async function getSupplierPanelProduct(
  database: DatabaseExecutor,
  ref: CatalogProductRef,
): Promise<SupplierPanelProduct> {
  const [row] = await database
    .select(panelProductColumns)
    .from(supplierProducts)
    .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
    .where(
      and(eq(supplierProducts.id, ref.productId), eq(supplierProducts.supplierId, ref.supplierId)),
    );
  if (row === undefined) {
    throw notFoundError(`Produto ${ref.productId} não encontrado neste fornecedor`);
  }
  return withPanelCompleteness(row);
}
