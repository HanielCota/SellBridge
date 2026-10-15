import {
  unavailableListingMessage,
  unavailableReason,
  type UnavailableReason,
} from "@sellbridge/shared/catalog-availability";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { daysBefore } from "@sellbridge/shared/time";
import {
  assertSellablePrice,
  pauseTransition,
  RETRYABLE_TARGET_STATUS,
} from "@sellbridge/shared/listing-rules";
import {
  toPaginated,
  type ListingSort,
  type Paginated,
  type Pagination,
} from "@sellbridge/shared/schemas";
import { and, count, desc, eq, ilike, inArray, sql, sum, type SQL } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  categories,
  listings,
  listingTargets,
  orderItems,
  orders,
  storeConnections,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { hasActiveTargets } from "./active-targets.ts";
import { availableStock } from "./sql/available-stock.ts";
import { isCountedOrder } from "./sql/counted-orders.ts";
import { timestampOf } from "./sql/raw-values.ts";
import { containsPattern } from "./sql/search-pattern.ts";

type ListingTargetStatus = (typeof listingTargets.$inferSelect)["status"];

const SALES_WINDOW_DAYS = 30;

export interface ListingStoreStatus {
  id: string;
  storeConnectionId: string;
  status: ListingTargetStatus;
  errorReason: string | null;
  attempts: number;
  externalUrl: string | null;
  publishedAt: Date | null;
  storeName: string;
  marketplace: (typeof storeConnections.$inferSelect)["marketplace"];
}

/** One product listing with its status in every store it was sent to. */
export interface ListingOverviewRow {
  listingId: string;
  /** The supplier product the listing sells. */
  productId: string;
  title: string;
  priceCents: number;
  costCents: number;
  sku: string;
  stock: number;
  imageUrl: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  supplierName: string;
  createdAt: Date;
  updatedAt: Date;
  unitsSold: number;
  /** Units sold per day over the sales window, oldest first. */
  dailySales: number[];
  stores: ListingStoreStatus[];
  /** Why the supplier keeps the product off the marketplaces; null while it can be sold. */
  unavailable: UnavailableReason | null;
}

/** How many listings have at least one store in each status (one listing can count twice). */
export interface ListingStatusCounts {
  all: number;
  published: number;
  error: number;
  paused: number;
}

export interface ListingOverviewFilters {
  status?: ListingTargetStatus | undefined;
  search?: string | undefined;
  sort?: ListingSort | undefined;
}

function hasTargetWith(status: ListingTargetStatus | undefined): SQL {
  const targetFilter = status ? sql` and ${listingTargets.status} = ${status}` : sql``;
  return sql`exists (select 1 from ${listingTargets} where ${listingTargets.listingId} = ${listings.id}${targetFilter})`;
}

function listingConditions(tenantId: string, filters: ListingOverviewFilters): SQL | undefined {
  const conditions: SQL[] = [eq(listings.tenantId, tenantId)];
  if (filters.search) {
    conditions.push(ilike(listings.title, containsPattern(filters.search)));
  }
  conditions.push(hasTargetWith(filters.status));
  return and(...conditions);
}

/**
 * The sales window the page sorts by and the cards count over. Both ends come from one
 * clock reading, so the sort, the units on each card and the daily series always agree:
 * orders after `until` (dated in the future) or at/before `since` count nowhere.
 */
interface SalesWindow {
  since: Date;
  until: Date;
}

function salesWindowEndingAt(until: Date): SalesWindow {
  return { since: daysBefore(SALES_WINDOW_DAYS, until), until };
}

function orderedWithin(salesWindow: SalesWindow): SQL {
  return sql`${orders.orderedAt} > ${timestampOf(salesWindow.since)}
    and ${orders.orderedAt} <= ${timestampOf(salesWindow.until)}`;
}

/** Units sold in the sales window, as a correlated subquery so the page can sort by it. */
function unitsSoldInWindow(salesWindow: SalesWindow): SQL<number> {
  return sql<number>`(
    select coalesce(sum(${orderItems.quantity}), 0)
    from ${orderItems}
    inner join ${orders} on ${orders.id} = ${orderItems.orderId}
    inner join ${listingTargets} on ${listingTargets.id} = ${orderItems.listingTargetId}
      and ${listingTargets.tenantId} = ${orderItems.tenantId}
    where ${listingTargets.listingId} = ${listings.id}
      and ${orderedWithin(salesWindow)}
      and ${isCountedOrder(orders.status)}
  )`;
}

function listingOrder(sort: ListingSort | undefined, salesWindow: SalesWindow): SQL[] {
  const newestFirst = [desc(listings.createdAt), desc(listings.id)];
  if (sort === "best_selling") {
    return [desc(unitsSoldInWindow(salesWindow)), ...newestFirst];
  }
  return newestFirst;
}

async function pageOfListingIds(
  database: Database,
  where: SQL | undefined,
  order: SQL[],
  pagination: Pagination,
): Promise<{ ids: string[]; total: number }> {
  const [rows, totals] = await Promise.all([
    database
      .select({ id: listings.id })
      .from(listings)
      .where(where)
      .orderBy(...order)
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    database.select({ total: count() }).from(listings).where(where),
  ]);
  return { ids: rows.map((row) => row.id), total: totals.at(0)?.total ?? 0 };
}

/** What `unavailableReason` needs; the query joins supplier_products and suppliers. */
const availabilityColumns = {
  productActive: supplierProducts.active,
  supplierActive: suppliers.active,
};

async function selectListingDetails(database: Database, ids: string[]) {
  return database
    .select({
      listingId: listings.id,
      productId: listings.supplierProductId,
      title: listings.title,
      priceCents: listings.priceCents,
      costCents: supplierProducts.costCents,
      sku: supplierProducts.sku,
      stock: availableStock,
      imageUrl: sql<string | null>`${supplierProducts.imageUrls}[1]`,
      categorySlug: categories.slug,
      categoryName: categories.name,
      supplierName: suppliers.name,
      createdAt: listings.createdAt,
      ...availabilityColumns,
    })
    .from(listings)
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
    .where(inArray(listings.id, ids));
}

async function selectStoreStatuses(database: Database, ids: string[]) {
  return database
    .select({
      listingId: listingTargets.listingId,
      id: listingTargets.id,
      storeConnectionId: listingTargets.storeConnectionId,
      status: listingTargets.status,
      errorReason: listingTargets.errorReason,
      attempts: listingTargets.attempts,
      externalUrl: listingTargets.externalUrl,
      publishedAt: listingTargets.publishedAt,
      updatedAt: listingTargets.updatedAt,
      storeName: storeConnections.shopName,
      marketplace: storeConnections.marketplace,
    })
    .from(listingTargets)
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(inArray(listingTargets.listingId, ids))
    .orderBy(storeConnections.shopName);
}

/**
 * Units sold per listing and day over the sales window, ignoring cancelled and returned
 * orders. Days count back from the window end (0 = its last 24 hours), so no time zone is
 * involved and every order inside the window lands on one of its days.
 */
async function selectDailySales(database: Database, ids: string[], salesWindow: SalesWindow) {
  // Inlined rather than bound: a bound parameter would make the select and the group by
  // two different expressions to Postgres. An ISO date string holds no quotes.
  const windowEnd = sql.raw(`'${salesWindow.until.toISOString()}'::timestamptz`);
  const daysAgo = sql<number>`floor(extract(epoch from (${windowEnd} - ${orders.orderedAt})) / 86400)::int`;
  return database
    .select({
      listingId: listingTargets.listingId,
      daysAgo,
      units: sum(orderItems.quantity).mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(
      listingTargets,
      and(
        eq(listingTargets.id, orderItems.listingTargetId),
        eq(listingTargets.tenantId, orderItems.tenantId),
      ),
    )
    .where(
      and(
        inArray(listingTargets.listingId, ids),
        orderedWithin(salesWindow),
        isCountedOrder(orders.status),
      ),
    )
    .groupBy(listingTargets.listingId, daysAgo);
}

type DailySalesRow = Awaited<ReturnType<typeof selectDailySales>>[number];

/** Spreads one listing's rows over the window, oldest day first, zero where nothing sold. */
function dailySeries(rows: readonly DailySalesRow[]): number[] {
  const series = Array.from({ length: SALES_WINDOW_DAYS }, () => 0);
  for (const row of rows) {
    const index = SALES_WINDOW_DAYS - 1 - row.daysAgo;
    if (index < 0 || index >= SALES_WINDOW_DAYS) {
      continue;
    }
    series[index] = (series[index] ?? 0) + row.units;
  }
  return series;
}

function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

async function loadOverviewRows(
  database: Database,
  ids: string[],
  salesWindow: SalesWindow,
): Promise<ListingOverviewRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const [details, statuses, sales] = await Promise.all([
    selectListingDetails(database, ids),
    selectStoreStatuses(database, ids),
    selectDailySales(database, ids, salesWindow),
  ]);
  const detailsById = new Map(details.map((row) => [row.listingId, row]));
  return ids.flatMap((id) => {
    const found = detailsById.get(id);
    if (!found) {
      return [];
    }
    const { productActive, supplierActive, ...detail } = found;
    const unavailable = unavailableReason({ productActive, supplierActive });
    const stores = statuses.filter((row) => row.listingId === id);
    const updatedAt = new Date(Math.max(...stores.map((row) => row.updatedAt.getTime())));
    const dailySales = dailySeries(sales.filter((row) => row.listingId === id));
    return [
      { ...detail, updatedAt, unitsSold: sumOf(dailySales), dailySales, stores, unavailable },
    ];
  });
}

function countWith(status: ListingTargetStatus): SQL<number> {
  return sql<number>`count(*) filter (where ${hasTargetWith(status)})`.mapWith(Number);
}

/** Counts for the status tabs: the search applies, the status filter itself does not. */
async function countByStatus(
  database: Database,
  tenantId: string,
  search: string | undefined,
): Promise<ListingStatusCounts> {
  const where = listingConditions(tenantId, { search });
  const [row] = await database
    .select({
      all: count(),
      published: countWith("published"),
      error: countWith("error"),
      paused: countWith("paused"),
    })
    .from(listings)
    .where(where);
  return row ?? { all: 0, published: 0, error: 0, paused: 0 };
}

export type ListingOverviewPage = Paginated<ListingOverviewRow> & {
  hasActive: boolean;
  statusCounts: ListingStatusCounts;
};

/** Paginates listings (one row per product), each with its status in every store. */
export async function listListingOverview(
  database: Database,
  tenantId: string,
  filters: ListingOverviewFilters,
  pagination: Pagination,
): Promise<ListingOverviewPage> {
  const where = listingConditions(tenantId, filters);
  const salesWindow = salesWindowEndingAt(new Date());
  const [page, hasActive, statusCounts] = await Promise.all([
    pageOfListingIds(database, where, listingOrder(filters.sort, salesWindow), pagination),
    hasActiveTargets(database, tenantId),
    countByStatus(database, tenantId, filters.search),
  ]);
  const rows = await loadOverviewRows(database, page.ids, salesWindow);
  return { ...toPaginated(rows, page.total, pagination), hasActive, statusCounts };
}

/** One listing of the tenant, shaped like a row of the overview; not found for other tenants. */
export async function getListingOverview(
  database: Database,
  tenantId: string,
  listingId: string,
): Promise<ListingOverviewRow> {
  const [owned] = await database
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.tenantId, tenantId), eq(listings.id, listingId)))
    .limit(1);
  if (!owned) {
    throw notFoundError("Publicação não encontrada");
  }
  const [row] = await loadOverviewRows(database, [owned.id], salesWindowEndingAt(new Date()));
  if (!row) {
    throw notFoundError("Publicação não encontrada");
  }
  return row;
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
 * Listings among `ids` the supplier keeps off the marketplaces, with the reason. Their product
 * and supplier rows stay share-locked until the caller's transaction ends, so an admin turning
 * them off waits for a resume in progress (and then pauses it) or the resume sees them off.
 */
async function unavailableAmong(executor: DatabaseExecutor, ids: readonly string[]) {
  const rows = await executor
    .select({ listingId: listings.id, ...availabilityColumns })
    .from(listings)
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(inArray(listings.id, [...ids]))
    .for("share", { of: [supplierProducts, suppliers] });
  return rows.flatMap(({ listingId, ...availability }) => {
    const reason = unavailableReason(availability);
    return reason === null ? [] : [{ listingId, reason }];
  });
}

/**
 * Pauses or resumes the listings in every store where they are live. Paused listings
 * are kept at zero stock on the marketplace by the sync job. Resuming skips products the
 * supplier keeps off, and refuses when every listing asked is one of them. Returns the
 * targets changed.
 */
export async function setListingsPaused(
  database: Database,
  tenantId: string,
  listingIds: readonly string[],
  paused: boolean,
): Promise<number> {
  await requireTenantListings(database, tenantId, listingIds);
  return await database.transaction(async (transaction) => {
    const blocked = paused ? [] : await unavailableAmong(transaction, listingIds);
    const [firstBlocked] = blocked;
    if (firstBlocked && blocked.length === new Set(listingIds).size) {
      throw conflictError(unavailableListingMessage(firstBlocked.reason));
    }
    const blockedIds = new Set(blocked.map((row) => row.listingId));
    const transition = pauseTransition(paused);
    const changed = await transaction
      .update(listingTargets)
      .set({ status: transition.to })
      .where(
        and(
          eq(listingTargets.tenantId, tenantId),
          inArray(
            listingTargets.listingId,
            listingIds.filter((id) => !blockedIds.has(id)),
          ),
          eq(listingTargets.status, transition.from),
        ),
      )
      .returning({ id: listingTargets.id });
    return changed.length;
  });
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
