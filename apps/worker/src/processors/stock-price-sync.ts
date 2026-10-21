import type { Database } from "@sellbridge/database";
import {
  findTargetsNeedingSync,
  markTargetSyncFailed,
  type TargetNeedingSync,
} from "@sellbridge/database/repositories";
import type { ConnectorRegistry } from "@sellbridge/marketplaces";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { expireStoreOnAuthError, resolveStoreCredentials } from "../lib/store-access.ts";
import {
  DESCRIPTION_RUN_BUDGET_MILLISECONDS,
  resendPendingDescriptions,
} from "./description-resend.ts";
import { reconcilePublicationStock } from "./publication-stock.ts";

export interface StockPriceSyncDependencies {
  database: Database;
  connectors: ConnectorRegistry;
  cipher: TokenCipher;
  acquireRateLimit: (key: string) => Promise<void>;
  /** Sellable units never offered on marketplaces (STOCK_SAFETY_UNITS). */
  safetyUnits: number;
  /** How long one run may take; defaults to `SYNC_RUN_BUDGET_MILLISECONDS` (tests shorten it). */
  runBudgetMilliseconds?: number;
  /** Targets fetched per batch; defaults to `SYNC_BATCH_SIZE` (tests shrink it). */
  batchSize?: number;
}

export interface StockPriceSyncSummary {
  synced: number;
  failed: number;
}

const MISSING_CREDENTIALS_REASON = "Loja sem token de acesso";
const SYNC_FAILURE_REASON = "Falha ao sincronizar estoque e preço";

/** "store_lost": the store has no usable credentials, so its other listings would fail too. */
type SyncOutcome = "synced" | "failed" | "store_lost";

async function recordSyncFailure(
  dependencies: StockPriceSyncDependencies,
  target: TargetNeedingSync,
  reason: string,
): Promise<void> {
  await markTargetSyncFailed(dependencies.database, target.targetId, reason);
}

async function syncOne(
  dependencies: StockPriceSyncDependencies,
  target: TargetNeedingSync,
): Promise<SyncOutcome> {
  try {
    const credentials = resolveStoreCredentials(dependencies.cipher, target.store);
    if (!credentials) {
      await recordSyncFailure(dependencies, target, MISSING_CREDENTIALS_REASON);
      return "store_lost";
    }
    await reconcilePublicationStock(dependencies, {
      tenantId: target.tenantId,
      targetId: target.targetId,
    });
    return "synced";
  } catch (error) {
    logger.warn("listing.sync_failed", { listingTargetId: target.targetId, error });
    const expired = await expireStoreOnAuthError(dependencies.database, target.store, error);
    await recordSyncFailure(dependencies, target, userMessageOr(error, SYNC_FAILURE_REASON));
    return expired ? "store_lost" : "failed";
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
/**
 * Stores synced at the same time (item 32.e): one slow or failing marketplace account no longer
 * holds every other seller's stock. Bounded by the database pool and the worker's memory.
 */
const STORES_IN_PARALLEL = 5;

type BatchSummary = StockPriceSyncSummary & { size: number };

/**
 * One store's listings in order, so its rate limit paces them. The deadline is checked per
 * listing, not per batch: in a marketplace outage one listing takes ~90 s of retries. The rest
 * keep their old attempt time and come first next run.
 */
async function syncStoreTargets(
  dependencies: StockPriceSyncDependencies,
  targets: readonly TargetNeedingSync[],
  deadline: number,
): Promise<StockPriceSyncSummary> {
  const summary = { synced: 0, failed: 0 };
  for (const target of targets) {
    if (Date.now() >= deadline) {
      return summary;
    }
    const outcome = await syncOne(dependencies, target);
    summary[outcome === "synced" ? "synced" : "failed"] += 1;
    if (outcome === "store_lost") {
      return summary;
    }
  }
  return summary;
}

function groupByStore(targets: readonly TargetNeedingSync[]): TargetNeedingSync[][] {
  const byStore = new Map<string, TargetNeedingSync[]>();
  for (const target of targets) {
    byStore.set(target.store.id, [...(byStore.get(target.store.id) ?? []), target]);
  }
  return [...byStore.values()];
}

/** Runs the stores through a fixed number of lanes, each taking the next waiting store. */
async function syncStoresInParallel(
  dependencies: StockPriceSyncDependencies,
  stores: readonly TargetNeedingSync[][],
  deadline: number,
): Promise<StockPriceSyncSummary> {
  const waiting = [...stores];
  const summary = { synced: 0, failed: 0 };
  const lane = async () => {
    for (let next = waiting.shift(); next !== undefined; next = waiting.shift()) {
      const store = await syncStoreTargets(dependencies, next, deadline);
      summary.synced += store.synced;
      summary.failed += store.failed;
    }
  };
  const lanes = Math.min(STORES_IN_PARALLEL, stores.length);
  await Promise.all(Array.from({ length: lanes }, lane));
  return summary;
}

interface SyncRun {
  deadline: number;
  startedAt: Date;
  batchSize: number;
}

async function syncBatch(
  dependencies: StockPriceSyncDependencies,
  run: SyncRun,
): Promise<BatchSummary> {
  // A target that failed earlier in this run still differs by stock or price; without the
  // start-of-run cut every later batch fetched it again until the budget ran out.
  const targets = await findTargetsNeedingSync(
    dependencies.database,
    run.batchSize,
    dependencies.safetyUnits,
    run.startedAt,
  );
  const summary = await syncStoresInParallel(dependencies, groupByStore(targets), run.deadline);
  return { ...summary, size: targets.length };
}

/** Pushes supplier stock and listing price changes to the marketplaces (all tenants). */
export function createStockPriceSyncProcessor(dependencies: StockPriceSyncDependencies) {
  return async function processStockPriceSync(): Promise<StockPriceSyncSummary> {
    const deadline =
      Date.now() + (dependencies.runBudgetMilliseconds ?? SYNC_RUN_BUDGET_MILLISECONDS);
    // The descriptions the marketplace refused (13.b) go first, in their own slice of the run.
    await resendPendingDescriptions(
      dependencies,
      Math.min(deadline, Date.now() + DESCRIPTION_RUN_BUDGET_MILLISECONDS),
    );
    const summary: StockPriceSyncSummary = { synced: 0, failed: 0 };
    const run: SyncRun = {
      deadline,
      startedAt: new Date(),
      batchSize: dependencies.batchSize ?? SYNC_BATCH_SIZE,
    };
    let batch = await syncBatch(dependencies, run);
    summary.synced += batch.synced;
    summary.failed += batch.failed;
    while (batch.size === run.batchSize && Date.now() < deadline) {
      batch = await syncBatch(dependencies, run);
      summary.synced += batch.synced;
      summary.failed += batch.failed;
    }
    if (summary.synced + summary.failed > 0) {
      logger.info("listing.sync_run", { ...summary });
    }
    return summary;
  };
}
