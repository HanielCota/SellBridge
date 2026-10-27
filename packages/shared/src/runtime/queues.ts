import { z } from "zod";

/** Queue names shared by the web app (producer) and the worker (consumer). */
export const QUEUE_NAMES = {
  publishListing: "publish-listing",
  tokenRefresh: "token-refresh",
  webhookEvents: "webhook-events",
  stockPriceSync: "stock-price-sync",
  /** Outbound webhooks to integrators (public API), not marketplace notifications. */
  webhookDelivery: "webhook-delivery",
  /** Re-queues lost publish jobs and ends publications stuck mid-call. */
  publishRecovery: "publish-recovery",
  /** Re-enqueues marketplace events stored but never processed. */
  webhookEventSweep: "webhook-event-sweep",
  /** Closes support tickets the reseller left unanswered after support replied. */
  ticketAutoClose: "ticket-auto-close",
  /** Reads the marketplace's tracking of parcels still on their way. */
  shipmentTracking: "shipment-tracking",
  /** Forwards a paid order to its suppliers on its own and e-mails them (item 21.b, flagged). */
  orderAutoForward: "order-auto-forward",
  /** Sends queued e-mail and push notifications to people (item 25). */
  notificationDelivery: "notification-delivery",
  /** The "new message" e-mail held back to the end of its 15-minute window (item 5). */
  orderMessageFollowUp: "order-message-follow-up",
} as const;

export const publishListingJobSchema = z.object({
  tenantId: z.string().min(1),
  listingTargetId: z.uuid(),
});
export type PublishListingJob = z.infer<typeof publishListingJobSchema>;

export const webhookEventJobSchema = z.object({
  webhookEventId: z.uuid(),
});

export const autoForwardJobSchema = z.object({ orderId: z.uuid() });

/**
 * Mercado Livre creates the sale's parcel (and its address) minutes after payment: 5 attempts
 * from 1 min apart, doubling, wait about half an hour before the order is left to the reseller.
 */
export const AUTO_FORWARD_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
} as const;

/** One job per order: repeated "paid" notifications of the same sale add nothing. */
export function autoForwardJobId(orderId: string): string {
  return `auto-forward-${orderId}`;
}

/** Publishing retries: 5 attempts with exponential backoff starting at 5 s. */
export const PUBLISH_JOB_ATTEMPTS = 5;
export const PUBLISH_BACKOFF_MILLISECONDS = 5_000;

export const PUBLISH_JOB_OPTIONS = {
  attempts: PUBLISH_JOB_ATTEMPTS,
  backoff: { type: "exponential", delay: PUBLISH_BACKOFF_MILLISECONDS },
  removeOnComplete: 1000,
  removeOnFail: 5000,
} as const;

/**
 * Every request for a stock and price sync, from the web and from the worker. One sync reads
 * every target that changed, so requests made while one is waiting add nothing; requests made
 * while one runs keep exactly one follow-up (it may have read the stock before them). Without
 * this, a marketplace outage that slows each run to hours piles up a job per order in Redis.
 */
export const STOCK_SYNC_JOB_NAME = "sync-stock-and-price";
export const STOCK_SYNC_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 1000,
  deduplication: { id: "stock-price-sync-request", keepLastIfActive: true },
} as const;

/**
 * Webhook processing: marketplaces expect a quick 200, the real work is retried here.
 * 8 attempts with exponential backoff from 30 s cover about an hour of marketplace outage;
 * past that, the worker's sweeper re-enqueues events still unprocessed.
 */
export const WEBHOOK_JOB_ATTEMPTS = 8;
export const WEBHOOK_BACKOFF_MILLISECONDS = 30_000;

export const WEBHOOK_JOB_OPTIONS = {
  attempts: WEBHOOK_JOB_ATTEMPTS,
  backoff: { type: "exponential", delay: WEBHOOK_BACKOFF_MILLISECONDS },
  removeOnComplete: 1000,
  removeOnFail: 5000,
} as const;

/** The subset of a BullMQ queue used to look jobs up (kept structural: no bullmq here). */
export interface JobLookup {
  getJob(
    jobId: string,
  ): Promise<{ getState(): Promise<string>; remove(): Promise<void> } | undefined>;
}

/** The subset of a BullMQ queue used to enqueue webhook events. */
export interface WebhookEventQueue extends JobLookup {
  add(
    name: string,
    data: { webhookEventId: string },
    options: typeof WEBHOOK_JOB_OPTIONS & { jobId: string },
  ): Promise<unknown>;
}

/**
 * Removes a finished job so its id can be reused; false when a live job already holds the id.
 * BullMQ keeps a finished job's id (removeOnComplete/removeOnFail) and silently ignores a new
 * job with that id.
 */
export async function releaseFinishedJob(queue: JobLookup, jobId: string): Promise<boolean> {
  const existing = await queue.getJob(jobId);
  if (!existing) {
    return true;
  }
  const state = await existing.getState();
  if (state !== "completed" && state !== "failed") {
    return false;
  }
  await existing.remove();
  return true;
}

/**
 * Enqueues the processing of a stored webhook event, using the event id as job id so copies
 * collapse into one job. BullMQ silently ignores a new job whose id is still kept as completed
 * or failed, so a finished job is removed first: an event that exhausted its retries can run
 * again. A waiting, delayed or active job is left alone.
 */
export async function enqueueWebhookEventJob(
  queue: WebhookEventQueue,
  webhookEventId: string,
): Promise<void> {
  const released = await releaseFinishedJob(queue, webhookEventId);
  if (!released) {
    return;
  }
  await queue.add("webhook", { webhookEventId }, { ...WEBHOOK_JOB_OPTIONS, jobId: webhookEventId });
}

/** The part of a BullMQ queue a health probe needs: its Redis connection. */
export interface RedisBackedQueue {
  getBackend(): { client: Promise<{ runCommand(name: string, args: string[]): Promise<unknown> }> };
}

/** Health probe (item 32.d): PING through the connection the queue already holds. */
export async function pingQueueConnection(queue: RedisBackedQueue): Promise<boolean> {
  const client = await queue.getBackend().client;
  // BullMQ runs `client[name](...args)`: the ioredis method name, lowercase ("PING" is not one).
  return (await client.runCommand("ping", [])) === "PONG";
}

export const orderMessageFollowUpJobSchema = z.object({
  shipmentId: z.uuid(),
  author: z.enum(["reseller", "supplier"]),
});
export type OrderMessageFollowUpJob = z.infer<typeof orderMessageFollowUpJobSchema>;

/**
 * One job per parcel, author and window end: every message held back in the same window asks for
 * the same job, and BullMQ keeps only the first.
 */
export function orderMessageFollowUpJobId(job: OrderMessageFollowUpJob, runAt: Date): string {
  return `order-message:${job.shipmentId}:${job.author}:${runAt.getTime()}`;
}

export const ORDER_MESSAGE_FOLLOW_UP_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { age: 24 * 3600 },
  removeOnFail: { age: 7 * 24 * 3600 },
} as const;
