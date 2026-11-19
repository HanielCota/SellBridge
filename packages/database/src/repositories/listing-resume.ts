import type { ListingPauseReason } from "@sellbridge/shared/listing-pause-reasons";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { listings, listingTargets, storeConnections, supplierProducts } from "../schema/index.ts";
import { productWeightGrams } from "./sql/product-weight.ts";

/**
 * A paused listing that may go back on sale, with what its price must pay: the price floor of
 * every marketplace it sells on (fee-model.ts), checked before resuming it.
 */
export interface ResumeCandidate {
  listingId: string;
  title: string;
  productId: string;
  priceCents: number;
  costCents: number;
  weightGrams: number | null;
  /** Every store the listing sells on, paused or not. */
  storeIds: string[];
  marketplaces: string[];
}

const BELOW_PRICE_FLOOR: ListingPauseReason = "price_below_floor";
const DISCONNECTED: ListingPauseReason = "store_disconnected";

async function candidatesWithPaused(
  database: Database,
  tenantId: string,
  pausedTarget: SQL | undefined,
): Promise<ResumeCandidate[]> {
  const paused = database
    .select({ listingId: listingTargets.listingId })
    .from(listingTargets)
    .where(
      and(eq(listingTargets.tenantId, tenantId), eq(listingTargets.status, "paused"), pausedTarget),
    );
  return database
    .select({
      listingId: listings.id,
      title: listings.title,
      productId: listings.supplierProductId,
      priceCents: listings.priceCents,
      costCents: supplierProducts.costCents,
      weightGrams: productWeightGrams,
      storeIds: sql<string[]>`array_agg(distinct ${listingTargets.storeConnectionId}::text)`,
      marketplaces: sql<string[]>`array_agg(distinct ${storeConnections.marketplace}::text)`,
    })
    .from(listings)
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(listingTargets, eq(listingTargets.listingId, listings.id))
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(and(eq(listings.tenantId, tenantId), inArray(listings.id, paused)))
    .groupBy(listings.id, supplierProducts.id);
}

/** The listings among `listingIds` with a paused store: the ones a resume would change. */
export async function findPausedListings(
  database: Database,
  tenantId: string,
  listingIds: readonly string[],
): Promise<ResumeCandidate[]> {
  if (listingIds.length === 0) {
    return [];
  }
  return candidatesWithPaused(
    database,
    tenantId,
    inArray(listingTargets.listingId, [...listingIds]),
  );
}

/** The listings disconnecting this store paused: what reconnecting it offers to resume. */
export async function findListingsPausedByDisconnection(
  database: Database,
  tenantId: string,
  storeConnectionId: string,
): Promise<ResumeCandidate[]> {
  return candidatesWithPaused(
    database,
    tenantId,
    and(
      eq(listingTargets.storeConnectionId, storeConnectionId),
      eq(listingTargets.pauseReason, DISCONNECTED),
    ),
  );
}

/**
 * Keeps the listings' paused stores paused, now because the price no longer pays the cost and
 * the fees; `storeConnectionId` limits it to one store. Returns how many stores changed.
 */
export async function holdListingsBelowPriceFloor(
  database: Database,
  tenantId: string,
  scope: { listingIds: readonly string[]; storeConnectionId?: string },
): Promise<number> {
  if (scope.listingIds.length === 0) {
    return 0;
  }
  const held = await database
    .update(listingTargets)
    .set({ pauseReason: BELOW_PRICE_FLOOR })
    .where(
      and(
        eq(listingTargets.tenantId, tenantId),
        inArray(listingTargets.listingId, [...scope.listingIds]),
        eq(listingTargets.status, "paused"),
        scope.storeConnectionId === undefined
          ? undefined
          : eq(listingTargets.storeConnectionId, scope.storeConnectionId),
      ),
    )
    .returning({ id: listingTargets.id });
  return held.length;
}
