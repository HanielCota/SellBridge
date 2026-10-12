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
} as const;

export const publishListingJobSchema = z.object({
  tenantId: z.string().min(1),
  listingTargetId: z.uuid(),
});
export type PublishListingJob = z.infer<typeof publishListingJobSchema>;

export const webhookEventJobSchema = z.object({
  webhookEventId: z.uuid(),
});

/** Publishing retries: 5 attempts with exponential backoff starting at 5 s. */
export const PUBLISH_JOB_ATTEMPTS = 5;
export const PUBLISH_BACKOFF_MILLISECONDS = 5_000;

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

/** The subset of a BullMQ queue used to enqueue webhook events (kept structural: no bullmq here). */
export interface WebhookEventQueue {
  getJob(
    jobId: string,
  ): Promise<{ getState(): Promise<string>; remove(): Promise<void> } | undefined>;
  add(
    name: string,
    data: { webhookEventId: string },
    options: typeof WEBHOOK_JOB_OPTIONS & { jobId: string },
  ): Promise<unknown>;
}

/** Removes a finished job so its id can be reused; false when a live job already holds the id. */
async function releaseFinishedJob(queue: WebhookEventQueue, jobId: string): Promise<boolean> {
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
