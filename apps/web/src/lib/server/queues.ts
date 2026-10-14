import {
  enqueueWebhookEventJob,
  PUBLISH_JOB_OPTIONS,
  QUEUE_NAMES,
  STOCK_SYNC_JOB_OPTIONS,
  type PublishListingJob,
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

let stockPriceSyncQueue: Queue | null = null;

/** A fresh job avoids losing an update while an earlier sync job is already active. */
export async function enqueueStockPriceSync(): Promise<void> {
  stockPriceSyncQueue ??= new Queue(QUEUE_NAMES.stockPriceSync, {
    connection: { url: environment.REDIS_URL },
    defaultJobOptions: STOCK_SYNC_JOB_OPTIONS,
  });
  await stockPriceSyncQueue.add("sync-stock-and-price", {});
}
