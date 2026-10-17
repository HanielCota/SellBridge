import { safetyMargin } from "@sellbridge/shared/stock-reservation";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { availableStock } from "./sql/available-stock.ts";
import { sellableOnMarketplace } from "./sql/sellable.ts";
import {
  listings,
  listingTargets,
  storeConnections,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";

/** Keeping live listings' stock and price in step with the marketplace (worker sync job). */

export interface TargetNeedingSync {
  targetId: string;
  externalId: string;
  stock: number;
  priceCents: number;
  store: typeof storeConnections.$inferSelect;
}

/**
 * Stock to show on the marketplace: zero while the reseller has the listing paused or the
 * product can no longer be sold (inactive product or supplier), and never
 * the last `safetyUnits` sellable units (a buffer against counts that lag behind the shelf).
 * The margin is a validated integer from the environment, inlined because a parameter inside
 * CASE would reach Postgres as text.
 */
function liveStock(safetyUnits: number) {
  const margin = sql.raw(String(safetyMargin(safetyUnits)));
  return sql<number>`case when ${listingTargets.status} = 'paused' or not ${sellableOnMarketplace()} then 0 else greatest(${availableStock} - ${margin}, 0) end`.mapWith(
    Number,
  );
}

/**
 * Live listings whose stock or price differs from what was last sent to the marketplace
 * (all tenants; used by the worker sync job). Never-attempted targets come first and the
 * rest follow the oldest attempt, so targets that keep failing cannot starve the others.
 */
export async function findTargetsNeedingSync(
  database: Database,
  limit = 200,
  safetyUnits = 0,
): Promise<TargetNeedingSync[]> {
  const live = liveStock(safetyUnits);
  const rows = await database
    .select({
      targetId: listingTargets.id,
      externalId: listingTargets.externalId,
      stock: live,
      priceCents: listings.priceCents,
      store: storeConnections,
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(
      and(
        sql`${listingTargets.status} in ('published', 'paused')`,
        eq(storeConnections.status, "connected"),
        sql`${listingTargets.externalId} is not null`,
        sql`(${listingTargets.syncedStock} is distinct from ${live}
          or ${listingTargets.syncedPriceCents} is distinct from ${listings.priceCents})`,
      ),
    )
    .orderBy(sql`${listingTargets.syncAttemptedAt} asc nulls first`, asc(listingTargets.id))
    .limit(limit);
  return rows.flatMap((row) => (row.externalId ? [{ ...row, externalId: row.externalId }] : []));
}

export async function markTargetSynced(
  database: Database,
  listingTargetId: string,
  synced: { stock: number; priceCents: number },
): Promise<void> {
  const now = new Date();
  await database
    .update(listingTargets)
    .set({
      syncedStock: synced.stock,
      syncedPriceCents: synced.priceCents,
      syncedAt: now,
      syncAttemptedAt: now,
      syncError: null,
    })
    .where(eq(listingTargets.id, listingTargetId));
}

/** Records a failed sync attempt so the target moves to the back of the sync queue. */
export async function markTargetSyncFailed(
  database: Database,
  listingTargetId: string,
  reason: string,
): Promise<void> {
  await database
    .update(listingTargets)
    .set({ syncAttemptedAt: new Date(), syncError: reason })
    .where(eq(listingTargets.id, listingTargetId));
}
