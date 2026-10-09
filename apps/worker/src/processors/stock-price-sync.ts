import type { Database } from "@sellbridge/db";
import {
  findTargetsNeedingSync,
  markStoreStatus,
  markTargetSynced,
  type TargetNeedingSync,
} from "@sellbridge/db/repositories";
import {
  type ConnectorRegistry,
  isMarketplaceAuthError,
  type TokenCipher,
} from "@sellbridge/marketplaces";
import { logger } from "@sellbridge/shared/logger";

export interface StockPriceSyncDependencies {
  db: Database;
  connectors: ConnectorRegistry;
  cipher: TokenCipher;
  acquireRateLimit: (key: string) => Promise<void>;
}

export interface StockPriceSyncSummary {
  synced: number;
  failed: number;
}

async function syncOne(
  deps: StockPriceSyncDependencies,
  target: TargetNeedingSync,
): Promise<boolean> {
  if (!target.store.accessTokenEnc) {
    return false;
  }
  try {
    await deps.acquireRateLimit(`${target.store.marketplace}:${target.store.id}`);
    await deps.connectors[target.store.marketplace].updateStockPrice(
      {
        externalShopId: target.store.externalShopId,
        accessToken: deps.cipher.decrypt(target.store.accessTokenEnc),
      },
      { externalId: target.externalId, stock: target.stock, priceCents: target.priceCents },
    );
    await markTargetSynced(deps.db, target.targetId, {
      stock: target.stock,
      priceCents: target.priceCents,
    });
    return true;
  } catch (error) {
    if (isMarketplaceAuthError(error)) {
      await markStoreStatus(deps.db, target.store.id, "expired", error.userMessage);
    }
    logger.warn("listing.sync_failed", { listingTargetId: target.targetId, error });
    return false;
  }
}

/** Pushes supplier stock and listing price changes to the marketplaces (all tenants). */
export function createStockPriceSyncProcessor(deps: StockPriceSyncDependencies) {
  return async function processStockPriceSync(): Promise<StockPriceSyncSummary> {
    const targets = await findTargetsNeedingSync(deps.db);
    const summary: StockPriceSyncSummary = { synced: 0, failed: 0 };
    for (const target of targets) {
      const ok = await syncOne(deps, target);
      summary[ok ? "synced" : "failed"] += 1;
    }
    if (targets.length > 0) {
      logger.info("listing.sync_run", { ...summary });
    }
    return summary;
  };
}
