import type { Database } from "@sellbridge/database";
import {
  failStalledPublications,
  findStalePendingTargets,
  type StalePendingTarget,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import type { PublishListingJob } from "@sellbridge/shared/queues";

/** Longer than every retry backoff of a publish job (5 + 10 + 20 + 40 s), with room to spare. */
const STALE_PENDING_MILLISECONDS = 10 * 60 * 1000;
/**
 * Longer than the slowest live publication: the rate limit wait happens before the claim, and
 * each of the three marketplace calls is bounded by 4 attempts of 15 s plus 3 waits of up to
 * 10 s (packages/marketplaces/src/http.ts), about 4.5 minutes in all.
 */
const STALLED_PUBLISHING_MILLISECONDS = 15 * 60 * 1000;

export const STALLED_PUBLISHING_REASON =
  "A publicação foi interrompida. Confira na loja se o anúncio foi criado antes de reprocessar.";

export interface RecoveryJob {
  readonly data: PublishListingJob;
  /** Same stale state, same id: BullMQ ignores the copy if an earlier run already queued it. */
  readonly jobId: string;
}

export interface PublishRecoveryDependencies {
  readonly database: Database;
  readonly enqueue: (jobs: readonly RecoveryJob[]) => Promise<void>;
  readonly now?: () => Date;
}

export interface PublishRecoveryResult {
  readonly requeued: number;
  readonly failed: number;
}

function millisecondsBefore(now: Date, milliseconds: number): Date {
  return new Date(now.getTime() - milliseconds);
}

function toRecoveryJob(target: StalePendingTarget): RecoveryJob {
  return {
    data: { tenantId: target.tenantId, listingTargetId: target.listingTargetId },
    jobId: `recover-${target.listingTargetId}-${target.updatedAt.getTime()}`,
  };
}

async function requeueStalePending(
  dependencies: PublishRecoveryDependencies,
  now: Date,
): Promise<number> {
  const stalePending = await findStalePendingTargets(
    dependencies.database,
    millisecondsBefore(now, STALE_PENDING_MILLISECONDS),
  );
  if (stalePending.length === 0) {
    return 0;
  }
  await dependencies.enqueue(stalePending.map(toRecoveryJob));
  return stalePending.length;
}

async function failStalledPublishing(
  dependencies: PublishRecoveryDependencies,
  now: Date,
): Promise<number> {
  return failStalledPublications(
    dependencies.database,
    millisecondsBefore(now, STALLED_PUBLISHING_MILLISECONDS),
    STALLED_PUBLISHING_REASON,
  );
}

/**
 * Safety net for the publish queue. Pending targets whose job never reached Redis are queued
 * again (the claim in the publish processor makes extra copies harmless); targets stuck in
 * "publishing" become errors, since retrying could list the product twice.
 */
export function createPublishRecoveryProcessor(dependencies: PublishRecoveryDependencies) {
  return async function recoverPublications(): Promise<PublishRecoveryResult> {
    const now = dependencies.now?.() ?? new Date();
    const requeued = await requeueStalePending(dependencies, now);
    const failed = await failStalledPublishing(dependencies, now);
    if (requeued > 0 || failed > 0) {
      logger.warn("listing.publications_recovered", { requeued, failed });
    }
    return { requeued, failed };
  };
}
