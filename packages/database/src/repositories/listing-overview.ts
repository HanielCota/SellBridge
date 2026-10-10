import { notFoundError } from "@sellbridge/shared/errors";
import {
  assertSellablePrice,
  pauseTransition,
  RETRYABLE_TARGET_STATUS,
} from "@sellbridge/shared/listing-rules";
import { toPaginated, type Paginated, type Pagination } from "@sellbridge/shared/schemas";
import { and, count, desc, eq, ilike, inArray, sql, sum, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  categories,
  listings,
  listingTargets,
  orderItems,
  orders,
  storeConnections,
  supplierProducts,
} from "../schema/index.ts";
import { hasActiveTargets } from "./active-targets.ts";
import { isCountedOrder } from "./sql/counted-orders.ts";
import { containsPattern } from "./sql/search-pattern.ts";
import { daysBefore } from "./time-window.ts";

type ListingTargetStatus = (typeof listingTargets.$inferSelect)["status"];

const SALES_WINDOW_DAYS = 30;

export interface ListingStoreStatus {
  id: string;
  status: ListingTargetStatus;
  errorReason: string | null;
  attempts: number;
  externalUrl: string | null;
  storeName: string;
  marketplace: (typeof storeConnections.$inferSelect)["marketplace"];
}

/** One product listing with its status in every store it was sent to. */
export interface ListingOverviewRow {
  listingId: string;
  title: string;
  priceCents: number;
  costCents: number;
  sku: string;
  stock: number;
  imageUrl: string | null;
  categorySlug: string | null;
  updatedAt: Date;
  unitsSold: number;
  stores: ListingStoreStatus[];
}

export interface ListingOverviewFilters {
  status?: ListingTargetStatus | undefined;
  search?: string | undefined;
}

function listingConditions(tenantId: string, filters: ListingOverviewFilters): SQL | undefined {
  const conditions: SQL[] = [eq(listings.tenantId, tenantId)];
  if (filters.search) {
    conditions.push(ilike(listings.title, containsPattern(filters.search)));
  }
  const targetFilter = filters.status
    ? sql` and ${listingTargets.status} = ${filters.status}`
    : sql``;
  conditions.push(
    sql`exists (select 1 from ${listingTargets} where ${listingTargets.listingId} = ${listings.id}${targetFilter})`,
  );
  return and(...conditions);
}

async function pageOfListingIds(
  database: Database,
  where: SQL | undefined,
  pagination: Pagination,
): Promise<{ ids: string[]; total: number }> {
  const [rows, totals] = await Promise.all([
    database
      .select({ id: listings.id })
      .from(listings)
      .where(where)
      .orderBy(desc(listings.createdAt), desc(listings.id))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    database.select({ total: count() }).from(listings).where(where),
  ]);
  return { ids: rows.map((row) => row.id), total: totals.at(0)?.total ?? 0 };
}

async function selectListingDetails(database: Database, ids: string[]) {
  return database
    .select({
      listingId: listings.id,
      title: listings.title,
      priceCents: listings.priceCents,
      costCents: supplierProducts.costCents,
      sku: supplierProducts.sku,
      stock: supplierProducts.stock,
      imageUrl: sql<string | null>`${supplierProducts.imageUrls}[1]`,
      categorySlug: categories.slug,
    })
    .from(listings)
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
    .where(inArray(listings.id, ids));
}

async function selectStoreStatuses(database: Database, ids: string[]) {
  return database
    .select({
      listingId: listingTargets.listingId,
      id: listingTargets.id,
      status: listingTargets.status,
      errorReason: listingTargets.errorReason,
      attempts: listingTargets.attempts,
      externalUrl: listingTargets.externalUrl,
      updatedAt: listingTargets.updatedAt,
      storeName: storeConnections.shopName,
      marketplace: storeConnections.marketplace,
    })
    .from(listingTargets)
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(inArray(listingTargets.listingId, ids))
    .orderBy(storeConnections.shopName);
}

/** Units sold per listing in the last 30 days, ignoring cancelled and returned orders. */
async function selectUnitsSold(database: Database, ids: string[]) {
  const since = daysBefore(SALES_WINDOW_DAYS);
  return database
    .select({
      listingId: listingTargets.listingId,
      units: sum(orderItems.quantity).mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(listingTargets, eq(listingTargets.id, orderItems.listingTargetId))
    .where(
      and(
        inArray(listingTargets.listingId, ids),
        sql`${orders.orderedAt} >= ${since.toISOString()}::timestamptz`,
        isCountedOrder(orders.status),
      ),
    )
    .groupBy(listingTargets.listingId);
}

async function loadOverviewRows(database: Database, ids: string[]): Promise<ListingOverviewRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const [details, statuses, sales] = await Promise.all([
    selectListingDetails(database, ids),
    selectStoreStatuses(database, ids),
    selectUnitsSold(database, ids),
  ]);
  const unitsByListing = new Map(sales.map((row) => [row.listingId, row.units]));
  const detailsById = new Map(details.map((row) => [row.listingId, row]));
  return ids.flatMap((id) => {
    const detail = detailsById.get(id);
    if (!detail) {
      return [];
    }
    const stores = statuses.filter((row) => row.listingId === id);
    const updatedAt = new Date(Math.max(...stores.map((row) => row.updatedAt.getTime())));
    return [{ ...detail, updatedAt, unitsSold: unitsByListing.get(id) ?? 0, stores }];
  });
}

/** Paginates listings (one row per product), each with its status in every store. */
export async function listListingOverview(
  database: Database,
  tenantId: string,
  filters: ListingOverviewFilters,
  pagination: Pagination,
): Promise<Paginated<ListingOverviewRow> & { hasActive: boolean }> {
  const where = listingConditions(tenantId, filters);
  const [page, hasActive] = await Promise.all([
    pageOfListingIds(database, where, pagination),
    hasActiveTargets(database, tenantId),
  ]);
  const rows = await loadOverviewRows(database, page.ids);
  return { ...toPaginated(rows, page.total, pagination), hasActive };
}

async function requireTenantListings(
  database: Database,
  tenantId: string,
  listingIds: readonly string[],
): Promise<void> {
  const [row] = await database
    .select({ total: count() })
    .from(listings)
    .where(and(eq(listings.tenantId, tenantId), inArray(listings.id, [...listingIds])));
  if ((row?.total ?? 0) !== new Set(listingIds).size) {
    throw notFoundError("Publicação não encontrada");
  }
}

/**
 * Pauses or resumes the listings in every store where they are live. Paused listings
 * are kept at zero stock on the marketplace by the sync job. Returns the targets changed.
 */
export async function setListingsPaused(
  database: Database,
  tenantId: string,
  listingIds: readonly string[],
  paused: boolean,
): Promise<number> {
  await requireTenantListings(database, tenantId, listingIds);
  const transition = pauseTransition(paused);
  const changed = await database
    .update(listingTargets)
    .set({ status: transition.to })
    .where(
      and(
        eq(listingTargets.tenantId, tenantId),
        inArray(listingTargets.listingId, [...listingIds]),
        eq(listingTargets.status, transition.from),
      ),
    )
    .returning({ id: listingTargets.id });
  return changed.length;
}

/** Changes the sale price; the sync job sends it to every store where the listing is live. */
export async function updateListingPrice(
  database: Database,
  tenantId: string,
  listingId: string,
  priceCents: number,
): Promise<void> {
  const [row] = await database
    .select({ costCents: supplierProducts.costCents })
    .from(listings)
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .where(and(eq(listings.tenantId, tenantId), eq(listings.id, listingId)));
  if (!row) {
    throw notFoundError("Publicação não encontrada");
  }
  assertSellablePrice(priceCents, row.costCents);
  await database
    .update(listings)
    .set({ priceCents })
    .where(and(eq(listings.tenantId, tenantId), eq(listings.id, listingId)));
}

/** Puts every failed store of the given listings back in the queue; returns their ids. */
export async function resetListingErrorsForRetry(
  database: Database,
  tenantId: string,
  listingIds: readonly string[],
): Promise<string[]> {
  await requireTenantListings(database, tenantId, listingIds);
  const reset = await database
    .update(listingTargets)
    .set({ status: "pending", errorReason: null })
    .where(
      and(
        eq(listingTargets.tenantId, tenantId),
        inArray(listingTargets.listingId, [...listingIds]),
        eq(listingTargets.status, RETRYABLE_TARGET_STATUS),
      ),
    )
    .returning({ id: listingTargets.id });
  return reset.map((row) => row.id);
}
