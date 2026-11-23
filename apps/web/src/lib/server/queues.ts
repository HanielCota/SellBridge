import {
  DELETED_STORE_PAUSE_JOB_OPTIONS,
  type DeletedStorePauseJob,
  deletedStorePauseJobId,
  enqueueStoreOrderCatchUpJob,
  erpCatalogExportJobId,
  erpCatalogExportJobSchema,
  erpCatalogReadJobId,
  erpCatalogReadJobSchema,
  ERP_STOCK_JOB_NAMES,
  ERP_STOCK_JOB_OPTIONS,
  ERP_STOCK_REFRESH_WINDOW_IN_MS,
  erpStockRefreshJobId,
  type ErpCatalogExportJob,
  type ErpCatalogReadJob,
  releaseFinishedJob,
  enqueueWebhookEventJob,
  pingQueueConnection,
  PUBLISH_JOB_OPTIONS,
  ORDER_MESSAGE_FOLLOW_UP_JOB_OPTIONS,
  orderMessageFollowUpJobId,
  type OrderMessageFollowUpJob,
  QUEUE_NAMES,
  STOCK_SYNC_JOB_NAME,
  STOCK_SYNC_JOB_OPTIONS,
  type PublishListingJob,
  type StoreOrderCatchUpJob,
} from "@sellbridge/shared/queues";
import { createRedisSlotStore } from "@sellbridge/shared/redis-slots";
import type { EmailQuotaStore } from "@sellbridge/shared/email-quota";
import { createRedisEmailQuotaStore } from "@sellbridge/shared/redis-email-quota-store";
import { Queue } from "bullmq";
import { environment } from "./environment.ts";

let publishQueue: Queue | null = null;

/** The web app only produces jobs; processing happens in apps/worker. */
function getPublishQueue(): Queue {
  if (publishQueue) {
    return publishQueue;
  }
  publishQueue = new Queue(QUEUE_NAMES.publishListing, {
    connection: { url: environment.REDIS_URL },
    defaultJobOptions: PUBLISH_JOB_OPTIONS,
  });
  return publishQueue;
}

export async function enqueuePublishJobs(jobs: readonly PublishListingJob[]): Promise<void> {
  if (jobs.length === 0) {
    return;
  }
  await getPublishQueue().addBulk(jobs.map((data) => ({ name: "publish", data })));
}

/** Health probe (item 32.d): Redis answers through the queue connection the app already has. */
export async function pingRedis(): Promise<boolean> {
  return pingQueueConnection(getPublishQueue());
}

/** Rate slots shared with the worker through Redis (an ERP quota is per account, not per process). */
export function sharedRateSlots(namespace: string) {
  return {
    reserve: async (key: string, spacingInMs: number) =>
      createRedisSlotStore(getPublishQueue(), namespace).reserve(key, spacingInMs),
  };
}

/** The daily e-mail counters, shared with the worker through Redis; connects on first use. */
export const sharedEmailQuotaStore: EmailQuotaStore = {
  reserve: async (reservation) =>
    createRedisEmailQuotaStore(getPublishQueue()).reserve(reservation),
  claimOnce: async (key, ttlInSeconds) =>
    createRedisEmailQuotaStore(getPublishQueue()).claimOnce(key, ttlInSeconds),
};

let webhookQueue: Queue | null = null;

function getWebhookQueue(): Queue {
  if (webhookQueue) {
    return webhookQueue;
  }
  webhookQueue = new Queue(QUEUE_NAMES.webhookEvents, {
    connection: { url: environment.REDIS_URL },
  });
  return webhookQueue;
}

/** jobId = event id: even if enqueued twice, BullMQ keeps a single job. */
export async function enqueueWebhookEvent(webhookEventId: string): Promise<void> {
  await enqueueWebhookEventJob(getWebhookQueue(), webhookEventId);
}

/** A reconnected store's sales, read by the webhook worker (see `storeOrderCatchUpJobSchema`). */
export async function enqueueStoreOrderCatchUp(job: StoreOrderCatchUpJob): Promise<void> {
  await enqueueStoreOrderCatchUpJob(getWebhookQueue(), job);
}

let stockPriceSyncQueue: Queue | null = null;

/** One follow-up at most per running sync (see `STOCK_SYNC_JOB_OPTIONS`). */
export async function enqueueStockPriceSync(): Promise<void> {
  stockPriceSyncQueue ??= new Queue(QUEUE_NAMES.stockPriceSync, {
    connection: { url: environment.REDIS_URL },
  });
  await stockPriceSyncQueue.add(STOCK_SYNC_JOB_NAME, {}, STOCK_SYNC_JOB_OPTIONS);
}

let erpStockQueue: Queue | null = null;

/**
 * Reads the products a Bling stock notice named, a few seconds later so the notices arriving
 * together are read in one request.
 */
export async function enqueueErpStockRefresh(supplierId: string): Promise<void> {
  erpStockQueue ??= new Queue(QUEUE_NAMES.erpStockSync, {
    connection: { url: environment.REDIS_URL },
  });
  await erpStockQueue.add(
    ERP_STOCK_JOB_NAMES.refreshSupplier,
    { supplierId },
    {
      ...ERP_STOCK_JOB_OPTIONS,
      delay: ERP_STOCK_REFRESH_WINDOW_IN_MS,
      jobId: erpStockRefreshJobId({ supplierId }, Date.now()),
    },
  );
}

/** Bling retries a notice for up to 3 days; a repeat inside that window is the same event. */
const ERP_NOTICE_SEEN_TTL_IN_SECONDS = 3 * 24 * 60 * 60;

function erpNoticeKey(eventId: string): string {
  return `sellbridge:erp-notice-seen:${eventId}`;
}

/**
 * Marks a Bling notice as received; false when its event id was already received (a repeat from
 * Bling or a replayed copy), so it is not stored and read again.
 */
export async function markErpNoticeSeen(eventId: string): Promise<boolean> {
  const client = await getPublishQueue().getBackend().client;
  const answer = await client.runCommand("set", [
    erpNoticeKey(eventId),
    "1",
    "EX",
    String(ERP_NOTICE_SEEN_TTL_IN_SECONDS),
    "NX",
  ]);
  return answer === "OK";
}

/** Forgets a notice whose storing failed, so Bling's retry of it is accepted. */
export async function forgetErpNotice(eventId: string): Promise<void> {
  const client = await getPublishQueue().getBackend().client;
  await client.runCommand("del", [erpNoticeKey(eventId)]);
}

let orderMessageFollowUpQueue: Queue | null = null;

/**
 * Holds a "new message" e-mail back to the end of its window (`planOrderMessageEmail`). The job
 * id names the parcel, author and window end, so messages of one window share a single job.
 */
export async function enqueueOrderMessageFollowUp(
  input: OrderMessageFollowUpJob & { runAt: Date },
): Promise<void> {
  orderMessageFollowUpQueue ??= new Queue(QUEUE_NAMES.orderMessageFollowUp, {
    connection: { url: environment.REDIS_URL },
  });
  const job = { shipmentId: input.shipmentId, author: input.author };
  await orderMessageFollowUpQueue.add("order-message-follow-up", job, {
    ...ORDER_MESSAGE_FOLLOW_UP_JOB_OPTIONS,
    jobId: orderMessageFollowUpJobId(job, input.runAt),
    delay: Math.max(0, input.runAt.getTime() - Date.now()),
  });
}

let erpCatalogExportQueue: Queue | null = null;

/** One waiting export per supplier: asking again while it waits adds nothing. */
export async function enqueueErpCatalogExport(input: ErpCatalogExportJob): Promise<void> {
  erpCatalogExportQueue ??= new Queue(QUEUE_NAMES.erpCatalogExport, {
    connection: { url: environment.REDIS_URL },
  });
  const job = erpCatalogExportJobSchema.parse(input);
  const jobId = erpCatalogExportJobId(job);
  if (await releaseFinishedJob(erpCatalogExportQueue, jobId)) {
    await erpCatalogExportQueue.add("erp-catalog-export", job, {
      jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    });
  }
}

let erpCatalogReadQueue: Queue | null = null;

/** One job per read; a new read gets a new id, so it never waits behind an old one. */
export async function enqueueErpCatalogRead(input: ErpCatalogReadJob): Promise<void> {
  erpCatalogReadQueue ??= new Queue(QUEUE_NAMES.erpCatalogRead, {
    connection: { url: environment.REDIS_URL },
  });
  const job = erpCatalogReadJobSchema.parse(input);
  await erpCatalogReadQueue.add("erp-catalog-read", job, {
    jobId: erpCatalogReadJobId(job),
    attempts: 1,
    removeOnComplete: 50,
    removeOnFail: 100,
  });
}

/** One connection per queue a "Tentar de novo" reached; only the few retryable queues get here. */
const retryQueues = new Map<string, Queue>();

export type FailedJobRetry = "retried" | "missing" | "not_failed";

/**
 * Runs a job that failed for good again, as BullMQ keeps it: "missing" when BullMQ no longer
 * keeps it, "not_failed" when it is already waiting or ran again since.
 */
export async function retryFailedJob(queueName: string, jobId: string): Promise<FailedJobRetry> {
  const queue =
    retryQueues.get(queueName) ??
    new Queue(queueName, { connection: { url: environment.REDIS_URL } });
  retryQueues.set(queueName, queue);
  const job = await queue.getJob(jobId);
  if (job === undefined) {
    return "missing";
  }
  if ((await job.getState()) !== "failed") {
    return "not_failed";
  }
  await job.retry("failed");
  return "retried";
}

let deletedStorePauseQueue: Queue | null = null;

/** Hands a deleted account's live listings to the worker, which pauses them until done. */
export async function enqueueDeletedStorePause(job: DeletedStorePauseJob): Promise<void> {
  deletedStorePauseQueue ??= new Queue(QUEUE_NAMES.deletedStorePause, {
    connection: { url: environment.REDIS_URL },
  });
  await deletedStorePauseQueue.add("pause-deleted-store", job, {
    ...DELETED_STORE_PAUSE_JOB_OPTIONS,
    jobId: deletedStorePauseJobId(job),
  });
}
