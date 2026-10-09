import type { Database } from "@sellbridge/database";
import {
  findTargetsNeedingSync,
  markStoreStatus,
  markTargetSynced,
  type TargetNeedingSync,
} from "@sellbridge/database/repositories";
import {
  type ConnectorRegistry,
  isMarketplaceAuthError,
  type TokenCipher,
} from "@sellbridge/marketplaces";
import { logger } from "@sellbridge/shared/logger";

export interface StockPriceSyncDependencies {
  database: Database;
  connectors: ConnectorRegistry;
  cipher: TokenCipher;
  acquireRateLimit: (key: string) => Promise<void>;
}

export interface StockPriceSyncSummary {
  synced: number;
  failed: number;
}

async function syncOne(
  dependencies: StockPriceSyncDependencies,
  target: TargetNeedingSync,
): Promise<boolean> {
  if (!target.store.accessTokenEnc) {
    return false;
  }
  try {
    await dependencies.acquireRateLimit(`${target.store.marketplace}:${target.store.id}`);
    await dependencies.connectors[target.store.marketplace].updateStockPrice(
      {
        externalShopId: target.store.externalShopId,
        accessToken: dependencies.cipher.decrypt(target.store.accessTokenEnc),
      },
      { externalId: target.externalId, stock: target.stock, priceCents: target.priceCents },
    );
    await markTargetSynced(dependencies.database, target.targetId, {
      stock: target.stock,
      priceCents: target.priceCents,
    });
    return true;
  } catch (error) {
    if (isMarketplaceAuthError(error)) {
      await markStoreStatus(dependencies.database, target.store.id, "expired", error.userMessage);
    }
    logger.warn("listing.sync_failed", { listingTargetId: target.targetId, error });
    return false;
  }
}

/** Pushes supplier stock and listing price changes to the marketplaces (all tenants). */
export function createStockPriceSyncProcessor(dependencies: StockPriceSyncDependencies) {
  return async function processStockPriceSync(): Promise<StockPriceSyncSummary> {
    const targets = await findTargetsNeedingSync(dependencies.database);
    const summary: StockPriceSyncSummary = { synced: 0, failed: 0 };
    for (const target of targets) {
      const ok = await syncOne(dependencies, target);
      summary[ok ? "synced" : "failed"] += 1;
    }
    if (targets.length > 0) {
      logger.info("listing.sync_run", { ...summary });
    }
    return summary;
  };
}
