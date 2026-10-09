import { and, count, eq, inArray, sql, sum } from "drizzle-orm";
import type { Database } from "../client.ts";
import { listingTargets, orders } from "../schema/index.ts";

const ACTIVITY_WINDOW_DAYS = 30;

export interface StoreActivity {
  /** Listings live in the store (published or paused). */
  liveListings: number;
  failedListings: number;
  /** Last 30 days, ignoring cancelled and returned orders. */
  orders: number;
  revenueCents: number;
}

export const EMPTY_STORE_ACTIVITY: StoreActivity = {
  liveListings: 0,
  failedListings: 0,
  orders: 0,
  revenueCents: 0,
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
  const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 86_400_000);
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
        sql`${orders.orderedAt} >= ${since.toISOString()}::timestamptz`,
        sql`${orders.status} not in ('cancelled', 'returned')`,
      ),
    )
    .groupBy(orders.storeConnectionId);
}

/** Listings and last-30-days sales per store, for the store cards. */
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
  const activity = new Map(ids.map((id) => [id, { ...EMPTY_STORE_ACTIVITY }]));
  for (const row of listingRows) {
    const entry = activity.get(row.storeId);
    if (entry) {
      entry.liveListings = row.live;
      entry.failedListings = row.failed;
    }
  }
  for (const row of salesRows) {
    const entry = activity.get(row.storeId);
    if (entry) {
      entry.orders = row.orders;
      entry.revenueCents = row.revenueCents;
    }
  }
  return activity;
}
