import {
  PUBLISH_BACKOFF_MS,
  PUBLISH_JOB_ATTEMPTS,
  QUEUE_NAMES,
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
