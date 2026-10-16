import {
  findTargetsWithPendingDescription,
  markDescriptionFailed,
  markDescriptionSent,
  type TargetWithPendingDescription,
} from "@sellbridge/database/repositories";
import { isRetryableError } from "@sellbridge/marketplaces";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  expireStoreOnAuthError,
  resolveStoreCredentials,
  storeRateKey,
} from "../lib/store-access.ts";
import type { StockPriceSyncDependencies } from "./stock-price-sync.ts";

/** Descriptions resent per run: a few, so one bad batch never delays the stock and price sync. */
const DESCRIPTION_BATCH_SIZE = 50;
/**
 * Time the descriptions get at the start of a run. They go first, in their own slice, so a stock
 * sync that takes the whole run (an outage, a big CSV) never leaves them out (13.b review).
 */
export const DESCRIPTION_RUN_BUDGET_MILLISECONDS = 30 * 1000;
const DESCRIPTION_FAILURE_REASON = "A descrição não chegou ao marketplace. Reenvie a descrição.";
const MISSING_CREDENTIALS_REASON = "Loja sem token de acesso. Reconecte a loja e reenvie.";

async function resendOne(
  dependencies: StockPriceSyncDependencies,
  target: TargetWithPendingDescription,
): Promise<boolean> {
  try {
    const credentials = resolveStoreCredentials(dependencies.cipher, target.store);
    if (credentials === null) {
      await markDescriptionFailed(dependencies.database, target.targetId, {
        reason: MISSING_CREDENTIALS_REASON,
        retryable: true,
      });
      return false;
    }
    await dependencies.acquireRateLimit(storeRateKey(target.store));
    await dependencies.connectors[target.store.marketplace].updateDescription(credentials, {
      externalId: target.externalId,
      plainText: target.plainText,
    });
    await markDescriptionSent(dependencies.database, target.targetId);
    return true;
  } catch (error) {
    logger.warn("listing.description_resend_failed", { listingTargetId: target.targetId, error });
    await expireStoreOnAuthError(dependencies.database, target.store, error);
    await markDescriptionFailed(dependencies.database, target.targetId, {
      reason: userMessageOr(error, DESCRIPTION_FAILURE_REASON),
      retryable: isRetryableError(error),
    });
    return false;
  }
}

/** A failed lookup is logged, never fatal: the stock and price sync of the run still goes. */
async function pendingDescriptions(
  dependencies: StockPriceSyncDependencies,
): Promise<TargetWithPendingDescription[]> {
  try {
    return await findTargetsWithPendingDescription(dependencies.database, DESCRIPTION_BATCH_SIZE);
  } catch (error) {
    logger.error("listing.description_lookup_failed", { error });
    return [];
  }
}

/**
 * Resends the descriptions a marketplace refused when the listing went live (item 13.b), within
 * the sync run's time. Each failure counts toward the automatic limit of the repository.
 */
export async function resendPendingDescriptions(
  dependencies: StockPriceSyncDependencies,
  deadline: number,
): Promise<void> {
  if (Date.now() >= deadline) {
    return;
  }
  const targets = await pendingDescriptions(dependencies);
  let sent = 0;
  for (const target of targets) {
    if (Date.now() >= deadline) {
      break;
    }
    sent += (await resendOne(dependencies, target)) ? 1 : 0;
  }
  if (targets.length > 0) {
    logger.info("listing.description_resend_run", { sent, failed: targets.length - sent });
  }
}
