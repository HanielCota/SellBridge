import type { Database } from "@sellbridge/database";
import {
  findTargetsNeedingSync,
  markTargetSynced,
  markTargetSyncFailed,
  type TargetNeedingSync,
} from "@sellbridge/database/repositories";
import type { ConnectorRegistry } from "@sellbridge/marketplaces";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  expireStoreOnAuthError,
  resolveStoreCredentials,
  storeRateKey,
} from "../lib/store-access.ts";

export interface StockPriceSyncDependencies {
  database: Database;
  connectors: ConnectorRegistry;
  cipher: TokenCipher;
  acquireRateLimit: (key: string) => Promise<void>;
  /** Sellable units never offered on marketplaces (STOCK_SAFETY_UNITS). */
  safetyUnits: number;
}

export interface StockPriceSyncSummary {
  synced: number;
  failed: number;
}

const MISSING_CREDENTIALS_REASON = "Loja sem token de acesso";
const SYNC_FAILURE_REASON = "Falha ao sincronizar estoque e preço";

async function recordSyncFailure(
  dependencies: StockPriceSyncDependencies,
  target: TargetNeedingSync,
  reason: string,
): Promise<false> {
  await markTargetSyncFailed(dependencies.database, target.targetId, reason);
  return false;
}

async function syncOne(
  dependencies: StockPriceSyncDependencies,
  target: TargetNeedingSync,
): Promise<boolean> {
  try {
    const credentials = resolveStoreCredentials(dependencies.cipher, target.store);
    if (!credentials) {
      return await recordSyncFailure(dependencies, target, MISSING_CREDENTIALS_REASON);
    }
    await dependencies.acquireRateLimit(storeRateKey(target.store));
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
    logger.warn("listing.sync_failed", { listingTargetId: target.targetId, error });
    await expireStoreOnAuthError(dependencies.database, target.store.id, error);
    return await recordSyncFailure(dependencies, target, userMessageOr(error, SYNC_FAILURE_REASON));
  }
}

/** Listings read per batch, oldest attempt first. */
const SYNC_BATCH_SIZE = 200;
/**
 * A run keeps taking batches while they come back full, so a CSV that touched thousands of
 * listings reaches the marketplaces in one run instead of 200 every 15 minutes. It stops at
 * this budget so it never overlaps the next scheduled run; listings that keep failing go to
 * the back of the queue and cannot hold it forever.
 */
const SYNC_RUN_BUDGET_MILLISECONDS = 4 * 60 * 1000;

async function syncBatch(
  dependencies: StockPriceSyncDependencies,
): Promise<StockPriceSyncSummary & { size: number }> {
  const targets = await findTargetsNeedingSync(
    dependencies.database,
    SYNC_BATCH_SIZE,
    dependencies.safetyUnits,
  );
  const batch = { synced: 0, failed: 0, size: targets.length };
  for (const target of targets) {
    const ok = await syncOne(dependencies, target);
    batch[ok ? "synced" : "failed"] += 1;
  }
  return batch;
}

/** Pushes supplier stock and listing price changes to the marketplaces (all tenants). */
export function createStockPriceSyncProcessor(dependencies: StockPriceSyncDependencies) {
  return async function processStockPriceSync(): Promise<StockPriceSyncSummary> {
    const deadline = Date.now() + SYNC_RUN_BUDGET_MILLISECONDS;
    const summary: StockPriceSyncSummary = { synced: 0, failed: 0 };
    let batch = await syncBatch(dependencies);
    summary.synced += batch.synced;
    summary.failed += batch.failed;
    while (batch.size === SYNC_BATCH_SIZE && Date.now() < deadline) {
      batch = await syncBatch(dependencies);
      summary.synced += batch.synced;
      summary.failed += batch.failed;
    }
    if (summary.synced + summary.failed > 0) {
      logger.info("listing.sync_run", { ...summary });
    }
    return summary;
  };
}
