import {
  isMarketplaceListingEndedError,
  isRetryableError,
  type MarketplaceConnector,
} from "@sellbridge/marketplaces";
import { listingIdsForProblem } from "@sellbridge/shared/job-failures";
import { logger } from "@sellbridge/shared/logger";
import { type DeletedStorePauseJob, deletedStorePauseJobSchema } from "@sellbridge/shared/queues";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { UnrecoverableError } from "bullmq";
import type { JobContext } from "../lib/job-context.ts";

interface DeletedStorePauseDependencies {
  connectors: Record<
    DeletedStorePauseJob["marketplace"],
    Pick<MarketplaceConnector, "updateStockPrice">
  >;
  cipher: Pick<TokenCipher, "decrypt">;
}

interface PauseRound {
  leftLive: string[];
  /** True while some failure may pass on a later attempt; false when none can. */
  worthRetrying: boolean;
}

async function zeroStockForEach(
  dependencies: DeletedStorePauseDependencies,
  job: DeletedStorePauseJob,
): Promise<PauseRound> {
  const connector = dependencies.connectors[job.marketplace];
  const credentials = {
    externalShopId: job.externalShopId,
    accessToken: dependencies.cipher.decrypt(job.accessTokenEnc),
  };
  const leftLive: string[] = [];
  let worthRetrying = false;
  for (const listing of job.listings) {
    try {
      await connector.updateStockPrice(credentials, { ...listing, stock: 0 });
    } catch (error) {
      if (isMarketplaceListingEndedError(error)) {
        continue;
      }
      logger.warn("account.deleted_store_pause_failed", {
        storeConnectionId: job.storeConnectionId,
        externalId: listing.externalId,
        error,
      });
      leftLive.push(listing.externalId);
      worthRetrying = worthRetrying || isRetryableError(error);
    }
  }
  return { leftLive, worthRetrying };
}

function leftLiveMessage(job: DeletedStorePauseJob, leftLive: readonly string[]): string {
  return `${leftLive.length} listing(s) of ${job.marketplace} shop_${job.externalShopId} still live: ${listingIdsForProblem(leftLive)}`;
}

/**
 * Sends zero stock for every listing of a deleted account's store. Any listing left live fails
 * the attempt, so BullMQ tries again (`DELETED_STORE_PAUSE_JOB_OPTIONS`); when no failure can pass
 * on a later attempt (an unsupported marketplace, a revoked token), it fails for good at once, and
 * the final failure reaches Problemas with the listings to pause by hand.
 */
export function createDeletedStorePauseProcessor(dependencies: DeletedStorePauseDependencies) {
  return async function processDeletedStorePause(job: JobContext): Promise<void> {
    const data = deletedStorePauseJobSchema.parse(job.data);
    const round = await zeroStockForEach(dependencies, data);
    if (round.leftLive.length === 0) {
      logger.info("account.deleted_store_paused", {
        storeConnectionId: data.storeConnectionId,
        listings: data.listings.length,
      });
      return;
    }
    const message = leftLiveMessage(data, round.leftLive);
    if (round.worthRetrying) {
      throw new Error(message);
    }
    throw new UnrecoverableError(message);
  };
}
