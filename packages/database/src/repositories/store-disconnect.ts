import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Database } from "../client.ts";
import { listings, listingTargets, storeConnections } from "../schema/index.ts";
import type { Marketplace } from "./stores.ts";

/** What pausing a store's listings on the marketplace needs, before its tokens are dropped. */
export interface StoreAccessForPause {
  marketplace: Marketplace;
  externalShopId: string;
  accessTokenEnc: string;
}

/** A listing live on the store, as the marketplace knows it. */
export interface LiveStoreTarget {
  targetId: string;
  externalId: string;
  priceCents: number;
}

interface TenantStore {
  tenantId: string;
  storeConnectionId: string;
}

/** The connected store's access, or null when there is none left to call the marketplace with. */
export async function findStoreAccessForPause(
  database: Database,
  store: TenantStore,
): Promise<StoreAccessForPause | null> {
  const [row] = await database
    .select({
      marketplace: storeConnections.marketplace,
      externalShopId: storeConnections.externalShopId,
      accessTokenEnc: storeConnections.accessTokenEnc,
    })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, store.tenantId),
        eq(storeConnections.id, store.storeConnectionId),
        eq(storeConnections.status, "connected"),
      ),
    );
  if (row === undefined || row.accessTokenEnc === null) {
    return null;
  }
  return { ...row, accessTokenEnc: row.accessTokenEnc };
}

/** The store's published listings (paused ones already show zero stock). */
export async function findLiveStoreTargets(
  database: Database,
  store: TenantStore,
): Promise<LiveStoreTarget[]> {
  const rows = await database
    .select({
      targetId: listingTargets.id,
      externalId: listingTargets.externalId,
      priceCents: listings.priceCents,
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .where(
      and(
        eq(listingTargets.tenantId, store.tenantId),
        eq(listingTargets.storeConnectionId, store.storeConnectionId),
        eq(listingTargets.status, "published"),
        isNotNull(listingTargets.externalId),
      ),
    );
  return rows.flatMap((row) =>
    row.externalId === null ? [] : [{ ...row, externalId: row.externalId }],
  );
}

/** Records listings the marketplace now shows with zero stock; returns how many changed. */
export async function markStoreTargetsPaused(
  database: Database,
  tenantId: string,
  targetIds: readonly string[],
): Promise<number> {
  if (targetIds.length === 0) {
    return 0;
  }
  const changed = await database
    .update(listingTargets)
    .set({ status: "paused", syncedStock: 0, syncedAt: new Date() })
    .where(
      and(
        eq(listingTargets.tenantId, tenantId),
        inArray(listingTargets.id, [...targetIds]),
        eq(listingTargets.status, "published"),
      ),
    )
    .returning({ id: listingTargets.id });
  return changed.length;
}
