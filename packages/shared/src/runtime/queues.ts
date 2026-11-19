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
  /** Reads each Mercado Livre store's open and recent claims again (safety net for notifications). */
  marketplaceClaimSweep: "marketplace-claim-sweep",
  /** Forwards a paid order to its suppliers on its own and e-mails them (item 21.b, flagged). */
  orderAutoForward: "order-auto-forward",
  /** Sends queued e-mail and push notifications to people (item 25). */
  notificationDelivery: "notification-delivery",
  /** The "new message" e-mail held back to the end of its 15-minute window (item 5). */
  orderMessageFollowUp: "order-message-follow-up",
  /** Creates in the supplier's ERP (Bling) the products it does not have yet. */
  erpCatalogExport: "erp-catalog-export",
  /** Reads the supplier's ERP catalog for an import, reporting progress (minutes for 400+). */
  erpCatalogRead: "erp-catalog-read",
  /** Keeps the stock of ERP-linked products equal to the ERP's (notifications and a 15-min check). */
  erpStockSync: "erp-stock-sync",
  /** Issues the NF-e of new parcels through the supplier's ERP and follows SEFAZ's answer. */
  erpInvoiceIssue: "erp-invoice-issue",
  /** Reads supplier payments back from Mercado Pago and refunds the ones that are due. */
  supplierPayments: "supplier-payments",
  /** Checks again the suppliers who signed up alone and still wait for approval. */
  supplierApproval: "supplier-approval",
  /** Checks once a day that each Mercado Livre store does not buy at its supplier's address. */
  buyerAddressCheck: "buyer-address-check",
  /** Asks each store's marketplace for its recent sales and brings in the ones whose notice was lost. */
  orderCheck: "order-check",
} as const;

export const publishListingJobSchema = z.object({
  tenantId: z.string().min(1),
  listingTargetId: z.uuid(),
});
export type PublishListingJob = z.infer<typeof publishListingJobSchema>;

/** One supplier's catalog sent to its ERP; a second request while one waits adds nothing. */
export const erpCatalogExportJobSchema = z.object({ supplierId: z.uuid() });
export type ErpCatalogExportJob = z.infer<typeof erpCatalogExportJobSchema>;

export function erpCatalogExportJobId(job: ErpCatalogExportJob): string {
  return `erp-catalog-export-${job.supplierId}`;
}

/** One read of a supplier's ERP catalog; the id ties the job to the read row it fills. */
export const erpCatalogReadJobSchema = z.object({ supplierId: z.uuid(), readId: z.uuid() });
export type ErpCatalogReadJob = z.infer<typeof erpCatalogReadJobSchema>;

export function erpCatalogReadJobId(job: ErpCatalogReadJob): string {
  return `erp-catalog-read-${job.readId}`;
}

/** The ERP stock jobs: the periodic round, one supplier's full check, and reads asked by notices. */
export const ERP_STOCK_JOB_NAMES = {
  checkAll: "check-all-erp-stock",
  checkSupplier: "check-erp-stock",
  refreshSupplier: "refresh-erp-stock",
} as const;

export const erpStockSupplierJobSchema = z.object({ supplierId: z.uuid() });
export type ErpStockSupplierJob = z.infer<typeof erpStockSupplierJobSchema>;

/** Notices of one supplier arriving within this window are read together, in one request. */
export const ERP_STOCK_REFRESH_WINDOW_IN_MS = 5_000;

export const ERP_STOCK_JOB_OPTIONS = { removeOnComplete: 100, removeOnFail: 500 } as const;

/** A supplier's full check waiting in the queue is not added twice by the next round. */
export function erpStockCheckJobId(job: ErpStockSupplierJob): string {
  return `erp-stock-check-${job.supplierId}`;
}

/**
 * One read per supplier and notice window: repeats inside the window add nothing, and a notice
 * arriving while that read runs gets the next window's read, so none waits for the 15-min check.
 *
 * @throws {RangeError} When `nowInMs` is not a finite number.
 */
export function erpStockRefreshJobId(job: ErpStockSupplierJob, nowInMs: number): string {
  if (!Number.isFinite(nowInMs)) {
    throw new RangeError(`nowInMs must be finite, got ${nowInMs}`);
  }
  const window = Math.floor(nowInMs / ERP_STOCK_REFRESH_WINDOW_IN_MS);
  return `erp-stock-refresh-${job.supplierId}-${window}`;
}

export const webhookEventJobSchema = z.object({
  webhookEventId: z.uuid(),
});

/**
 * A reconnected store's sales since it lost its access, read from the marketplace. It runs on the
 * webhook queue: notifications about a store without access are closed on arrival instead of
 * waiting for the reconnection, so this is how those sales come in.
 */
/** Rounds one reconnection may take: 100 rounds read up to 100,000 orders and 50,000 events. */
export const MAX_CATCH_UP_ROUNDS = 100;

export const storeOrderCatchUpJobSchema = z.object({
  storeConnectionId: z.uuid(),
  since: z.iso.datetime(),
  /** A later round: where the order read stopped; the held events still start at `since`. */
  resumeFrom: z.iso.datetime().optional(),
  /** A later round whose orders were all read: only held events are left. */
  ordersDone: z.boolean().optional(),
  round: z.number().int().min(1).max(MAX_CATCH_UP_ROUNDS).optional(),
});
export type StoreOrderCatchUpJob = z.infer<typeof storeOrderCatchUpJobSchema>;

/**
 * One catch-up per reconnection: reconnecting twice from the same point adds nothing.
 *
 * @throws {Error} When `since` is not a readable date, instead of an id ending in `NaN`.
 */
export function storeOrderCatchUpJobId(job: StoreOrderCatchUpJob): string {
  const sinceInMs = Date.parse(job.since);
  if (Number.isFinite(sinceInMs)) {
    const base = `order-catch-up-${job.storeConnectionId}-${sinceInMs}`;
    return job.round === undefined ? base : `${base}-round-${job.round}`;
  }

  throw new Error(`Invalid store order catch-up start date: ${JSON.stringify(job.since)}`);
}

/** One store's periodic order check (docs/decisions/2026-11-19-conferencia-periodica-de-pedidos.md). */
export const orderCheckJobSchema = z.object({
  storeConnectionId: z.uuid(),
  /** Start of the sales read: two days back, or the store's connection when it is newer. */
  from: z.iso.datetime(),
});
export type OrderCheckJob = z.infer<typeof orderCheckJobSchema>;

/** One check per store at a time: a run never stacks onto a check still waiting or running. */
export function orderCheckJobId(job: Pick<OrderCheckJob, "storeConnectionId">): string {
  return `order-check-${job.storeConnectionId}`;
}

/** A refused read (rate limit, outage) is tried again a little later, three times in all. */
export const ORDER_CHECK_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: 100,
  removeOnFail: 1000,
} as const;

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

/** The job of one stored marketplace event, in the webhook events queue. */
export const WEBHOOK_EVENT_JOB_NAME = "webhook";
/** A reconnected store's catch-up of missed sales, in the same queue but with no stored event. */
export const STORE_ORDER_CATCH_UP_JOB_NAME = "order-catch-up";

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
  await queue.add(
    WEBHOOK_EVENT_JOB_NAME,
    { webhookEventId },
    { ...WEBHOOK_JOB_OPTIONS, jobId: webhookEventId },
  );
}

/** The subset of a BullMQ queue used to enqueue a reconnected store's catch-up. */
export interface StoreOrderCatchUpQueue extends JobLookup {
  add(
    name: string,
    data: StoreOrderCatchUpJob,
    options: typeof WEBHOOK_JOB_OPTIONS & { jobId: string },
  ): Promise<unknown>;
}

/**
 * Enqueues a reconnected store's catch-up. A store first connected less than a month ago asks
 * from the same point on every reconnection, so the id repeats: a finished job with it is removed
 * first, or BullMQ would silently drop a later reconnection's catch-up (and one that ran out of
 * attempts could never run again). A waiting or active one already covers the reconnection.
 *
 * @throws {ZodError} When the job does not match `storeOrderCatchUpJobSchema`.
 */
export async function enqueueStoreOrderCatchUpJob(
  queue: StoreOrderCatchUpQueue,
  job: StoreOrderCatchUpJob,
): Promise<void> {
  const catchUp = storeOrderCatchUpJobSchema.parse(job);
  const jobId = storeOrderCatchUpJobId(catchUp);
  const released = await releaseFinishedJob(queue, jobId);
  if (released) {
    await queue.add(STORE_ORDER_CATCH_UP_JOB_NAME, catchUp, { ...WEBHOOK_JOB_OPTIONS, jobId });
  }
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
