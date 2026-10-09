import { z } from "zod";

/** Queue names shared by the web app (producer) and the worker (consumer). */
export const QUEUE_NAMES = {
  publishListing: "publish-listing",
  tokenRefresh: "token-refresh",
  webhookEvents: "webhook-events",
  stockPriceSync: "stock-price-sync",
} as const;

export const publishListingJobSchema = z.object({
  tenantId: z.string().min(1),
  listingTargetId: z.uuid(),
});
export type PublishListingJob = z.infer<typeof publishListingJobSchema>;

export const tokenRefreshJobSchema = z.object({
  /** When set, refreshes only this connection; otherwise scans every expiring one. */
  storeConnectionId: z.uuid().optional(),
});
export type TokenRefreshJob = z.infer<typeof tokenRefreshJobSchema>;

export const webhookEventJobSchema = z.object({
  webhookEventId: z.uuid(),
});
export type WebhookEventJob = z.infer<typeof webhookEventJobSchema>;

/** Publishing retries: 5 attempts with exponential backoff starting at 5 s. */
export const PUBLISH_JOB_ATTEMPTS = 5;
export const PUBLISH_BACKOFF_MS = 5_000;

/** Webhook processing: marketplaces expect a quick 200, the real work is retried here. */
export const WEBHOOK_JOB_ATTEMPTS = 5;
export const WEBHOOK_BACKOFF_MS = 3_000;
