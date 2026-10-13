import type { Database } from "@sellbridge/database";
import {
  findTargetsNeedingSync,
  markTargetSynced,
  markTargetSyncFailed,
  type TargetNeedingSync,
} from "@sellbridge/database/repositories";
import type { ConnectorRegistry } from "@sellbridge/marketplaces";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { expireStoreOnAuthError, resolveStoreCredentials } from "../lib/store-access.ts";

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

function syncFailureReason(error: unknown): string {
  if (isAppError(error)) {
    return error.userMessage;
  }
  return error instanceof Error ? error.message : String(error);
}

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
    logger.warn("listing.sync_failed", { listingTargetId: target.targetId, error });
    await expireStoreOnAuthError(dependencies.database, target.store.id, error);
    return await recordSyncFailure(dependencies, target, syncFailureReason(error));
  }
}

/** Listings pushed per run; the rest wait for the next run, oldest attempt first. */
const SYNC_BATCH_SIZE = 200;

/** Pushes supplier stock and listing price changes to the marketplaces (all tenants). */
export function createStockPriceSyncProcessor(dependencies: StockPriceSyncDependencies) {
  return async function processStockPriceSync(): Promise<StockPriceSyncSummary> {
    const targets = await findTargetsNeedingSync(
      dependencies.database,
      SYNC_BATCH_SIZE,
      dependencies.safetyUnits,
    );
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
