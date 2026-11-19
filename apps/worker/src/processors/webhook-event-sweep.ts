import type { Database } from "@sellbridge/database";
import {
  abandonStaleWebhookEvents,
  type AbandonedWebhookEvent,
  findUnprocessedWebhookEvents,
  pruneWebhookEvents,
  type UnprocessedEventCursor,
} from "@sellbridge/database/repositories";
import { FEE_CHANNEL_OWNERS, feeChannelOf } from "@sellbridge/shared/channel-fees";
import { WEBHOOK_EVENT_ABANDONED_EVENT } from "@sellbridge/shared/job-failures";
import { logger } from "@sellbridge/shared/logger";
import { QUEUE_NAMES } from "@sellbridge/shared/queues";

/** Past the route's enqueue: an event this old without a result lost its job or its retries. */
const UNPROCESSED_WEBHOOK_GRACE_MILLISECONDS = 10 * 60 * 1000;
/** Older events are handed to the team on Problemas instead of being retried forever. */
const UNPROCESSED_WEBHOOK_WINDOW_MILLISECONDS = 24 * 60 * 60 * 1000;
/** How far back an event can still be handed over: the first run never reports a distant past. */
const ABANDON_LOOKBACK_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;
/** Events handed over per run; the next run takes the rest. */
const ABANDON_BATCH_SIZE = 100;
const SWEEP_BATCH_SIZE = 500;
/** Pages per run: 10 000 events, far above a normal backlog, so one run still ends quickly. */
const SWEEP_MAX_PAGES = 20;

export interface WebhookEventSweepDependencies {
  readonly database: Database;
  /** Enqueues one event; a job still waiting, delayed or running is left alone. */
  readonly enqueue: (webhookEventId: string) => Promise<void>;
  readonly now?: () => Date;
}

function reportAbandoned(event: AbandonedWebhookEvent): void {
  const owner = FEE_CHANNEL_OWNERS[feeChannelOf(event.marketplace)];
  logger.error(WEBHOOK_EVENT_ABANDONED_EVENT, {
    reason: `Um aviso de venda ${owner} falhou por 24 horas e parou de ser tentado: a venda pode não ter entrado. Use "Tentar de novo".`,
    webhookEventId: event.id,
    queue: QUEUE_NAMES.webhookEvents,
    marketplace: event.marketplace,
    topic: event.topic,
    lastError: event.error,
    receivedAt: event.receivedAt.toISOString(),
    problemKey: event.id,
  });
}

/** Valid events past the retry window go to the team, once each, instead of being dropped. */
async function abandonStale(database: Database, now: number): Promise<number> {
  const abandoned = await abandonStaleWebhookEvents(database, {
    receivedAfter: new Date(now - ABANDON_LOOKBACK_MILLISECONDS),
    receivedBefore: new Date(now - UNPROCESSED_WEBHOOK_WINDOW_MILLISECONDS),
    limit: ABANDON_BATCH_SIZE,
    now: new Date(now),
  });
  for (const event of abandoned) {
    reportAbandoned(event);
  }
  return abandoned.length;
}

/**
 * Re-enqueues valid marketplace events that were stored but never processed: the route's
 * enqueue failed, or every retry failed (the marketplace does not resend: it got its 200). Events
 * still unprocessed after a day are handed to the team on the admin Problemas page.
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
    await abandonStale(dependencies.database, now);
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
