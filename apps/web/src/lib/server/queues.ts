import {
  enqueueWebhookEventJob,
  pingQueueConnection,
  PUBLISH_JOB_OPTIONS,
  ORDER_MESSAGE_FOLLOW_UP_JOB_OPTIONS,
  orderMessageFollowUpJobId,
  type OrderMessageFollowUpJob,
  QUEUE_NAMES,
  STOCK_SYNC_JOB_NAME,
  STOCK_SYNC_JOB_OPTIONS,
  storeOrderCatchUpJobId,
  type PublishListingJob,
  type StoreOrderCatchUpJob,
  WEBHOOK_JOB_OPTIONS,
} from "@sellbridge/shared/queues";
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
  await getWebhookQueue().add("order-catch-up", job, {
    ...WEBHOOK_JOB_OPTIONS,
    jobId: storeOrderCatchUpJobId(job),
  });
}

let stockPriceSyncQueue: Queue | null = null;

/** One follow-up at most per running sync (see `STOCK_SYNC_JOB_OPTIONS`). */
export async function enqueueStockPriceSync(): Promise<void> {
  stockPriceSyncQueue ??= new Queue(QUEUE_NAMES.stockPriceSync, {
    connection: { url: environment.REDIS_URL },
  });
  await stockPriceSyncQueue.add(STOCK_SYNC_JOB_NAME, {}, STOCK_SYNC_JOB_OPTIONS);
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
