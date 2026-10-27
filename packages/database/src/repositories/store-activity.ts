import { resolvePeriod } from "@sellbridge/shared/period-range";
import { and, count, eq, inArray, max, sql, sum } from "drizzle-orm";
import type { Database } from "../client.ts";
import { listingTargets, orders } from "../schema/index.ts";
import { isCountedOrder } from "./sql/counted-orders.ts";
import { timestampOf } from "./sql/raw-values.ts";

export interface StoreActivity {
  /** Listings live in the store (published or paused). */
  liveListings: number;
  failedListings: number;
  /** Listings queued or on their way to the marketplace: chosen, just not live yet. */
  publishingListings: number;
  /** Last 30 days, ignoring cancelled and returned orders. */
  orders: number;
  revenueCents: number;
  /** The most recent listing sync sent to the marketplace; null before the first one. */
  lastSyncedAt: Date | null;
}

export const EMPTY_STORE_ACTIVITY: StoreActivity = {
  liveListings: 0,
  failedListings: 0,
  publishingListings: 0,
  orders: 0,
  revenueCents: 0,
  lastSyncedAt: null,
};

async function listingCounts(database: Database, tenantId: string, storeIds: string[]) {
  return database
    .select({
      storeId: listingTargets.storeConnectionId,
      live: sql<number>`count(*) filter (where ${listingTargets.status} in ('published', 'paused'))`.mapWith(
        Number,
      ),
      failed: sql<number>`count(*) filter (where ${listingTargets.status} = 'error')`.mapWith(
        Number,
      ),
      publishing:
        sql<number>`count(*) filter (where ${listingTargets.status} in ('pending', 'publishing'))`.mapWith(
          Number,
        ),
      lastSyncedAt: max(listingTargets.syncedAt),
    })
    .from(listingTargets)
    .where(
      and(
        eq(listingTargets.tenantId, tenantId),
        inArray(listingTargets.storeConnectionId, storeIds),
      ),
    )
    .groupBy(listingTargets.storeConnectionId);
}

async function recentSales(database: Database, tenantId: string, storeIds: string[]) {
  // The dashboard's "30 dias" (today and the 29 days before it, in Brazil): 30 x 24 h back from
  // now started mid-day, and the store card and the dashboard filtered to it disagreed.
  const since = resolvePeriod({ period: "30d" }, new Date()).from;
  return database
    .select({
      storeId: orders.storeConnectionId,
      orders: count(),
      revenueCents: sum(orders.totalCents).mapWith(Number),
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        inArray(orders.storeConnectionId, storeIds),
        sql`${orders.orderedAt} >= ${timestampOf(since)}`,
        isCountedOrder(orders.status),
      ),
    )
    .groupBy(orders.storeConnectionId);
}

/** Listings, last sync and last-30-days sales per store, for the store cards. */
export async function getStoreActivity(
  database: Database,
  tenantId: string,
  storeIds: readonly string[],
): Promise<Map<string, StoreActivity>> {
  const ids = [...storeIds];
  if (ids.length === 0) {
    return new Map();
  }
  const [listingRows, salesRows] = await Promise.all([
    listingCounts(database, tenantId, ids),
    recentSales(database, tenantId, ids),
  ]);
  const listingsByStore = new Map(listingRows.map((row) => [row.storeId, row]));
  const salesByStore = new Map(salesRows.map((row) => [row.storeId, row]));
  return new Map(
    ids.map((id): [string, StoreActivity] => {
      const listingCount = listingsByStore.get(id);
      const sales = salesByStore.get(id);
      return [
        id,
        {
          liveListings: listingCount?.live ?? EMPTY_STORE_ACTIVITY.liveListings,
          failedListings: listingCount?.failed ?? EMPTY_STORE_ACTIVITY.failedListings,
          publishingListings: listingCount?.publishing ?? EMPTY_STORE_ACTIVITY.publishingListings,
          orders: sales?.orders ?? EMPTY_STORE_ACTIVITY.orders,
          revenueCents: sales?.revenueCents ?? EMPTY_STORE_ACTIVITY.revenueCents,
          lastSyncedAt: listingCount?.lastSyncedAt ?? EMPTY_STORE_ACTIVITY.lastSyncedAt,
        },
      ];
    }),
  );
}

/** Only when each store last synced a listing, for screens without the sales figures (admin). */
export async function getStoreLastSyncs(
  database: Database,
  tenantId: string,
  storeIds: readonly string[],
): Promise<Map<string, Date | null>> {
  const ids = [...storeIds];
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await database
    .select({
      storeId: listingTargets.storeConnectionId,
      lastSyncedAt: max(listingTargets.syncedAt),
    })
    .from(listingTargets)
    .where(
      and(eq(listingTargets.tenantId, tenantId), inArray(listingTargets.storeConnectionId, ids)),
    )
    .groupBy(listingTargets.storeConnectionId);
  return new Map(rows.map((row) => [row.storeId, row.lastSyncedAt]));
}
