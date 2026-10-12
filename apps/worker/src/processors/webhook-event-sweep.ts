import type { Database } from "@sellbridge/database";
import { findUnprocessedWebhookEvents } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";

/** Past the route's enqueue: an event this old without a result lost its job or its retries. */
export const UNPROCESSED_WEBHOOK_GRACE_MILLISECONDS = 10 * 60 * 1000;
/** Older events are left for manual inspection instead of being retried forever. */
export const UNPROCESSED_WEBHOOK_WINDOW_MILLISECONDS = 24 * 60 * 60 * 1000;
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
