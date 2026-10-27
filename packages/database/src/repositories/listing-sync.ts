import { MAX_SENT_UNITS, showcaseMargin } from "@sellbridge/shared/marketplace-units";
import { safetyMargin } from "@sellbridge/shared/stock-reservation";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { availableStock } from "./sql/available-stock.ts";
import { listingSellable } from "./sql/sellable.ts";
import { targetMatchesStoreSupplier } from "./sql/store-supplier-match.ts";
import {
  listings,
  listingTargets,
  storeConnections,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";

/** Keeping live listings' stock and price in step with the marketplace (worker sync job). */

export interface TargetNeedingSync {
  tenantId: string;
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
 * Shopee listings get `showcaseUnits` on top while real units remain (`marketplaceUnits`).
 * Both numbers are validated integers from the environment, inlined because a parameter inside
 * CASE would reach Postgres as text. The sum runs in bigint and stops at `MAX_SENT_UNITS`: in
 * integer, a huge shelf count overflowed and failed the whole batch.
 */
function liveStock(units: SentStockUnits) {
  const margin = sql.raw(String(safetyMargin(units.safetyUnits)));
  const showcase = sql.raw(String(showcaseMargin(units.showcaseUnits)));
  const maxSent = sql.raw(String(MAX_SENT_UNITS));
  const realUnits = sql`greatest(${availableStock} - ${margin}, 0)`;
  return sql<number>`case when ${listingTargets.status} = 'paused' or ${listingTargets.pauseRequested} or not ${listingSellable()} or not ${targetMatchesStoreSupplier()} then 0 when ${storeConnections.marketplace} = 'shopee' and ${realUnits} > 0 then least(${realUnits}::bigint + ${showcase}, ${maxSent})::integer else ${realUnits} end`.mapWith(
    Number,
  );
}

/** What the sync sends beyond the real units: the safety margin off, the Shopee showcase on. */
export interface SentStockUnits {
  safetyUnits: number;
  showcaseUnits: number;
}

const REAL_UNITS_ONLY: SentStockUnits = { safetyUnits: 0, showcaseUnits: 0 };

/**
 * Live listings whose stock or price differs from what was last sent to the marketplace
 * (all tenants; used by the worker sync job). Never-attempted targets come first and the
 * rest follow the oldest attempt, so targets that keep failing cannot starve the others.
 * `attemptedBefore` leaves out targets already tried since that instant, so one run never
 * sends the same failing target twice.
 */
export async function findTargetsNeedingSync(
  database: Database,
  limit = 200,
  units: SentStockUnits = REAL_UNITS_ONLY,
  attemptedBefore?: Date,
): Promise<TargetNeedingSync[]> {
  const live = liveStock(units);
  const rows = await database
    .select({
      tenantId: listingTargets.tenantId,
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
        attemptedBefore === undefined
          ? undefined
          : or(
              isNull(listingTargets.syncAttemptedAt),
              lt(listingTargets.syncAttemptedAt, attemptedBefore),
            ),
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
