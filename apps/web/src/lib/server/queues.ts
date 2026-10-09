import {
  PUBLISH_BACKOFF_MS,
  PUBLISH_JOB_ATTEMPTS,
  QUEUE_NAMES,
  WEBHOOK_BACKOFF_MS,
  WEBHOOK_JOB_ATTEMPTS,
  type PublishListingJob,
} from "@sellbridge/shared/queues";
import { Queue } from "bullmq";
import { env } from "./env.ts";

let publishQueue: Queue | null = null;

/** The web app only produces jobs; processing happens in apps/worker. */
function getPublishQueue(): Queue {
  if (publishQueue) {
    return publishQueue;
  }
  publishQueue = new Queue(QUEUE_NAMES.publishListing, {
    connection: { url: env.REDIS_URL },
    defaultJobOptions: {
      attempts: PUBLISH_JOB_ATTEMPTS,
      backoff: { type: "exponential", delay: PUBLISH_BACKOFF_MS },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
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
    connection: { url: env.REDIS_URL },
    defaultJobOptions: {
      attempts: WEBHOOK_JOB_ATTEMPTS,
      backoff: { type: "exponential", delay: WEBHOOK_BACKOFF_MS },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
  return webhookQueue;
}

export async function enqueueWebhookEvent(webhookEventId: string): Promise<void> {
  // jobId = event id: even if enqueued twice, BullMQ keeps a single job.
  await getWebhookQueue().add("webhook", { webhookEventId }, { jobId: webhookEventId });
}
