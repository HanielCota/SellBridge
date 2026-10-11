import type { Database } from "@sellbridge/database";
import {
  failStalledPublications,
  findStalePendingTargets,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import type { PublishListingJob } from "@sellbridge/shared/queues";

/** Longer than every retry backoff of a publish job (5 + 10 + 20 + 40 s), with room to spare. */
export const STALE_PENDING_MILLISECONDS = 10 * 60 * 1000;
/** Longer than the slowest real publication (rate limit wait plus three marketplace calls). */
export const STALLED_PUBLISHING_MILLISECONDS = 15 * 60 * 1000;

export const STALLED_PUBLISHING_REASON =
  "A publicação foi interrompida. Confira na loja se o anúncio foi criado antes de reprocessar.";

export interface RecoveryJob {
  data: PublishListingJob;
  /** Same stale state, same id: BullMQ ignores the copy if an earlier run already queued it. */
  jobId: string;
}

export interface PublishRecoveryDependencies {
  database: Database;
  enqueue: (jobs: readonly RecoveryJob[]) => Promise<void>;
  now?: () => Date;
}

export interface PublishRecoveryResult {
  requeued: number;
  failed: number;
}

/**
 * Safety net for the publish queue. Pending targets whose job never reached Redis are queued
 * again (the claim in the publish processor makes extra copies harmless); targets stuck in
 * "publishing" become errors, since retrying could list the product twice.
 */
export function createPublishRecoveryProcessor(dependencies: PublishRecoveryDependencies) {
  return async function recoverPublications(): Promise<PublishRecoveryResult> {
    const now = dependencies.now?.() ?? new Date();
    const stalePending = await findStalePendingTargets(
      dependencies.database,
      new Date(now.getTime() - STALE_PENDING_MILLISECONDS),
    );
    await dependencies.enqueue(
      stalePending.map((target) => ({
        data: { tenantId: target.tenantId, listingTargetId: target.listingTargetId },
        jobId: `recover-${target.listingTargetId}-${target.updatedAt.getTime()}`,
      })),
    );
    const failed = await failStalledPublications(
      dependencies.database,
      new Date(now.getTime() - STALLED_PUBLISHING_MILLISECONDS),
      STALLED_PUBLISHING_REASON,
    );
    if (stalePending.length > 0 || failed > 0) {
      logger.warn("listing.publications_recovered", { requeued: stalePending.length, failed });
    }
    return { requeued: stalePending.length, failed };
  };
}
