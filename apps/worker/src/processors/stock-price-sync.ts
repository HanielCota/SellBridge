import type { Database } from "@sellbridge/database";
import {
  findTargetsNeedingSync,
  markTargetSynced,
  type TargetNeedingSync,
} from "@sellbridge/database/repositories";
import type { ConnectorRegistry } from "@sellbridge/marketplaces";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { logger } from "@sellbridge/shared/logger";
import { expireStoreOnAuthError, resolveStoreCredentials } from "../lib/store-access.ts";

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
  try {
    const credentials = resolveStoreCredentials(dependencies.cipher, target.store);
    if (!credentials) {
      return false;
    }
    await dependencies.acquireRateLimit(`${target.store.marketplace}:${target.store.id}`);
    await dependencies.connectors[target.store.marketplace].updateStockPrice(credentials, {
      externalId: target.externalId,
      stock: target.stock,
      priceCents: target.priceCents,
    });
    await markTargetSynced(dependencies.database, target.targetId, {
      stock: target.stock,
      priceCents: target.priceCents,
    });
    return true;
  } catch (error) {
    await expireStoreOnAuthError(dependencies.database, target.store.id, error);
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
