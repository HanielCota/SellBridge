import type { Database } from "@sellbridge/database";
import {
  findUnprocessedWebhookEvents,
  pruneWebhookEvents,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";

/** Past the route's enqueue: an event this old without a result lost its job or its retries. */
const UNPROCESSED_WEBHOOK_GRACE_MILLISECONDS = 10 * 60 * 1000;
/** Older events are left for manual inspection instead of being retried forever. */
const UNPROCESSED_WEBHOOK_WINDOW_MILLISECONDS = 24 * 60 * 60 * 1000;
const SWEEP_BATCH_SIZE = 500;

export interface WebhookEventSweepDependencies {
  readonly database: Database;
  /** Enqueues one event; a job still waiting, delayed or running is left alone. */
  readonly enqueue: (webhookEventId: string) => Promise<void>;
  readonly now?: () => Date;
}

/**
 * Re-enqueues valid marketplace events that were stored but never processed: the route's
 * enqueue failed, or every retry failed (the marketplace does not resend: it got its 200).
 */
export function createWebhookEventSweepProcessor(dependencies: WebhookEventSweepDependencies) {
  return async function sweepUnprocessedWebhookEvents(): Promise<number> {
    const now = (dependencies.now?.() ?? new Date()).getTime();
    const eventIds = await findUnprocessedWebhookEvents(dependencies.database, {
      receivedAfter: new Date(now - UNPROCESSED_WEBHOOK_WINDOW_MILLISECONDS),
      receivedBefore: new Date(now - UNPROCESSED_WEBHOOK_GRACE_MILLISECONDS),
      limit: SWEEP_BATCH_SIZE,
    });
    for (const webhookEventId of eventIds) {
      await dependencies.enqueue(webhookEventId);
    }
    if (eventIds.length > 0) {
      logger.warn("webhook.unprocessed_requeued", { count: eventIds.length });
    }
    return eventIds.length;
  };
}

/**
 * Finished marketplace events are kept 30 days: long past any marketplace retry (the duplicate
 * check needs them) and enough to inspect a problem. Deleted in batches until none is left.
 */
export const WEBHOOK_EVENT_RETENTION_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const PRUNE_BATCH_SIZE = 5000;
/** A safety stop: 100 batches (500 000 events) per run; the next run takes the rest. */
const PRUNE_MAX_BATCHES = 100;

export function createWebhookEventPruneProcessor(dependencies: {
  readonly database: Database;
  readonly now?: () => Date;
}) {
  return async function pruneOldWebhookEvents(): Promise<number> {
    const before = new Date(
      (dependencies.now?.() ?? new Date()).getTime() - WEBHOOK_EVENT_RETENTION_MILLISECONDS,
    );
    let total = 0;
    for (let batch = 0; batch < PRUNE_MAX_BATCHES; batch += 1) {
      const deleted = await pruneWebhookEvents(dependencies.database, {
        before,
        limit: PRUNE_BATCH_SIZE,
      });
      total += deleted;
      if (deleted < PRUNE_BATCH_SIZE) {
        break;
      }
    }
    if (total > 0) {
      logger.info("webhook.events_pruned", { count: total });
    }
    return total;
  };
}
