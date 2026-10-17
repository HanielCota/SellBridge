import {
  disconnectStore,
  findLiveStoreTargets,
  findStoreAccessForPause,
  type LiveStoreTarget,
  markStoreTargetsPaused,
  type StoreAccessForPause,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { connectors, tokenCipher } from "@/lib/server/marketplaces";

/** How many of the store's live listings now show zero stock, and how many could not. */
export interface DisconnectOutcome {
  paused: number;
  leftLive: number;
}

/**
 * The seller waits on the dialog while this runs: past this budget the remaining listings are
 * reported as still live instead of holding the request open (each call has its own timeout).
 */
const PAUSE_BUDGET_MILLISECONDS = 20_000;

interface TenantStore {
  tenantId: string;
  storeConnectionId: string;
}

/** Sends zero stock for each listing, one at a time, until done or out of time. */
async function zeroStockOnMarketplace(
  access: StoreAccessForPause,
  targets: readonly LiveStoreTarget[],
): Promise<string[]> {
  const credentials = {
    externalShopId: access.externalShopId,
    accessToken: tokenCipher.decrypt(access.accessTokenEnc),
  };
  const deadline = Date.now() + PAUSE_BUDGET_MILLISECONDS;
  const pausedIds: string[] = [];
  for (const target of targets) {
    if (Date.now() >= deadline) {
      break;
    }
    try {
      await connectors[access.marketplace].updateStockPrice(credentials, {
        externalId: target.externalId,
        stock: 0,
        priceCents: target.priceCents,
      });
      pausedIds.push(target.targetId);
    } catch (error) {
      logger.warn("store.disconnect_pause_failed", { listingTargetId: target.targetId, error });
    }
  }
  return pausedIds;
}

/**
 * Listings that stay live after the tokens are gone keep selling with no stock sync, so they are
 * paused on the marketplace while the store can still be called. A failure never blocks the
 * disconnection: the seller is told how many to pause by hand.
 */
async function pauseLiveListings(store: TenantStore): Promise<DisconnectOutcome> {
  const targets = await findLiveStoreTargets(database, store);
  if (targets.length === 0) {
    return { paused: 0, leftLive: 0 };
  }
  const access = await findStoreAccessForPause(database, store);
  if (access === null) {
    return { paused: 0, leftLive: targets.length };
  }
  const pausedIds = await zeroStockOnMarketplace(access, targets);
  const paused = await markStoreTargetsPaused(database, store.tenantId, pausedIds);
  return { paused, leftLive: targets.length - pausedIds.length };
}

/** Disconnects a store; with `pauseListings`, first sends zero stock for its live listings. */
export async function disconnectStoreForTenant(request: {
  tenantId: string;
  storeConnectionId: string;
  pauseListings: boolean;
}): Promise<DisconnectOutcome> {
  const store = { tenantId: request.tenantId, storeConnectionId: request.storeConnectionId };
  const outcome = request.pauseListings
    ? await pauseLiveListings(store)
    : { paused: 0, leftLive: 0 };
  await disconnectStore(database, store.tenantId, store.storeConnectionId);
  logger.info("store.disconnected", { ...store, ...outcome });
  return outcome;
}
