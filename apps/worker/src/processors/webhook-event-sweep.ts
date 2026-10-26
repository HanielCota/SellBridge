import type { Database } from "@sellbridge/database";
import {
  findUnprocessedWebhookEvents,
  pruneWebhookEvents,
  type UnprocessedEventCursor,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";

/** Past the route's enqueue: an event this old without a result lost its job or its retries. */
const UNPROCESSED_WEBHOOK_GRACE_MILLISECONDS = 10 * 60 * 1000;
/** Older events are left for manual inspection instead of being retried forever. */
const UNPROCESSED_WEBHOOK_WINDOW_MILLISECONDS = 24 * 60 * 60 * 1000;
const SWEEP_BATCH_SIZE = 500;
/** Pages per run: 10 000 events, far above a normal backlog, so one run still ends quickly. */
const SWEEP_MAX_PAGES = 20;

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
    const window = {
      receivedAfter: new Date(now - UNPROCESSED_WEBHOOK_WINDOW_MILLISECONDS),
      receivedBefore: new Date(now - UNPROCESSED_WEBHOOK_GRACE_MILLISECONDS),
      limit: SWEEP_BATCH_SIZE,
    };
    // Walks the whole window, not only its oldest 500: events that keep failing for a day (a
    // marketplace that keeps refusing) would otherwise hide every newer lost event.
    let requeued = 0;
    let after: UnprocessedEventCursor | undefined;
    for (let page = 0; page < SWEEP_MAX_PAGES; page += 1) {
      const events = await findUnprocessedWebhookEvents(dependencies.database, {
        ...window,
        after,
      });
      for (const event of events) {
        await dependencies.enqueue(event.id);
      }
      requeued += events.length;
      after = events.at(-1);
      if (events.length < SWEEP_BATCH_SIZE) {
        break;
      }
    }
    if (requeued > 0) {
      logger.warn("webhook.unprocessed_requeued", { count: requeued });
    }
    return requeued;
  };
}

/**
 * Finished marketplace events are kept 30 days: long past any marketplace retry (the duplicate
 * check needs them) and enough to inspect a problem. Deleted in batches until none is left.
 */
export const WEBHOOK_EVENT_RETENTION_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const PRUNE_BATCH_SIZE = 5000;
/**
 * A safety stop: 100 batches (500 000 events) per run; the next run takes the rest. The run is
 * hourly (index.ts): daily, 500 000 a day fell behind a marketplace sending millions.
 */
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
