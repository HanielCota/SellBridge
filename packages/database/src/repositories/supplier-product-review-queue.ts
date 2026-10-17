import { notFoundError } from "@sellbridge/shared/errors";
import { toPaginated } from "@sellbridge/shared/schemas";
import {
  REVIEW_QUEUE_PAGE_SIZE,
  reviewKindOf,
  type ReviewKind,
  type ReviewQueueSearch,
} from "@sellbridge/shared/supplier-product-review";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { categories, supplierProducts, suppliers } from "../schema/index.ts";
import {
  panelProductColumns,
  withPanelCompleteness,
  type SupplierPanelProduct,
  type SupplierPanelProductRow,
} from "./supplier-panel-catalog.ts";
import { matchesEveryWord } from "./sql/search-pattern.ts";

/** A product waiting for the platform's review, with who sent it. */
export interface ProductAwaitingReview extends SupplierPanelProduct {
  supplierName: string;
  supplierCity: string;
  supplierState: string;
  kind: ReviewKind;
}

const awaitingReview = eq(supplierProducts.reviewStatus, "in_review");

/** Oldest submission first; a row never submitted (legacy data) goes last, then by id. */
const queueOrder = [
  sql`${supplierProducts.submittedAt} asc nulls last`,
  asc(supplierProducts.id),
] as const;

const queueColumns = {
  ...panelProductColumns,
  supplierName: suppliers.name,
  supplierCity: suppliers.city,
  supplierState: suppliers.state,
};

function toAwaitingReview(row: {
  product: SupplierPanelProductRow;
  categoryName: string | null;
  categorySlug: string | null;
  supplierName: string;
  supplierCity: string;
  supplierState: string;
}): ProductAwaitingReview {
  return {
    ...withPanelCompleteness(row),
    supplierName: row.supplierName,
    supplierCity: row.supplierCity,
    supplierState: row.supplierState,
    kind: reviewKindOf(row.product),
  };
}

function queueCondition(query: string | undefined) {
  return and(
    awaitingReview,
    query === undefined
      ? undefined
      : matchesEveryWord(query, [supplierProducts.sku, supplierProducts.title, suppliers.name]),
  );
}

/** Every supplier's products in review, searchable by SKU, title or supplier name. */
export async function listProductsAwaitingReview(
  database: DatabaseExecutor,
  search: ReviewQueueSearch,
) {
  const condition = queueCondition(search.query);
  const [total] = await database
    .select({ value: count() })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(condition);
  const rows = await database
    .select(queueColumns)
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
    .where(condition)
    .orderBy(...queueOrder)
    .limit(REVIEW_QUEUE_PAGE_SIZE)
    .offset((search.page - 1) * REVIEW_QUEUE_PAGE_SIZE);
  const pagination = { page: search.page, pageSize: REVIEW_QUEUE_PAGE_SIZE };
  return toPaginated(rows.map(toAwaitingReview), total?.value ?? 0, pagination);
}

/** How many products wait for review: the admin's tab badge. */
export async function countProductsAwaitingReview(database: DatabaseExecutor): Promise<number> {
  const [row] = await database
    .select({ value: count() })
    .from(supplierProducts)
    .where(awaitingReview);
  return row?.value ?? 0;
}

/** The next product in the queue after this one, so the reviewer can go on without going back. */
async function nextInQueue(database: DatabaseExecutor, productId: string): Promise<string | null> {
  const [next] = await database
    .select({ id: supplierProducts.id })
    .from(supplierProducts)
    .where(and(awaitingReview, ne(supplierProducts.id, productId)))
    .orderBy(...queueOrder)
    .limit(1);
  return next?.id ?? null;
}

/**
 * Any status is readable, so a reviewer who opens a product another admin just decided sees
 * the decision instead of an error; only an unknown id is not found.
 */
export async function getProductForReview(database: DatabaseExecutor, productId: string) {
  const [row] = await database
    .select(queueColumns)
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
    .where(eq(supplierProducts.id, productId));
  if (row === undefined) {
    throw notFoundError(`Produto ${productId} não encontrado`);
  }
  return {
    product: toAwaitingReview(row),
    nextProductId: await nextInQueue(database, productId),
  };
}
