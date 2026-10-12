import { createDatabase } from "@sellbridge/database/client";
import { createConnectorRegistry } from "@sellbridge/marketplaces";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { logger } from "@sellbridge/shared/logger";
import {
  PUBLISH_BACKOFF_MILLISECONDS,
  PUBLISH_JOB_ATTEMPTS,
  QUEUE_NAMES,
} from "@sellbridge/shared/queues";
import { Queue, Worker } from "bullmq";
import { startHealthServer } from "./health.ts";
import { createRateLimiter } from "./lib/rate-limiter.ts";
import { environment } from "./environment.ts";
import { createPublishListingProcessor } from "./processors/publish-listing.ts";
import { createPublishRecoveryProcessor, type RecoveryJob } from "./processors/publish-recovery.ts";
import { createStockPriceSyncProcessor } from "./processors/stock-price-sync.ts";
import { createTicketAutoCloseProcessor } from "./processors/ticket-auto-close.ts";
import { createTokenRefreshProcessor } from "./processors/token-refresh.ts";
import { createWebhookDeliveryProcessor } from "./processors/webhook-delivery.ts";
import { createWebhookEventProcessor } from "./processors/webhook-event.ts";

const connection = { url: environment.REDIS_URL, maxRetriesPerRequest: null };
const database = createDatabase(environment.DATABASE_URL);
const cipher = createTokenCipher(environment.TOKEN_ENCRYPTION_KEY);
const connectors = createConnectorRegistry({
  appUrl: environment.APP_URL,
  mockWebhookSecret: environment.MOCK_WEBHOOK_SECRET,
  mockLatencyMilliseconds: environment.MOCK_LATENCY_MILLISECONDS,
  mercadoLivre: {
    clientId: environment.MERCADO_LIVRE_CLIENT_ID,
    clientSecret: environment.MERCADO_LIVRE_CLIENT_SECRET,
  },
});
const storeRateLimiter = createRateLimiter({ tokensPerInterval: 5, intervalMilliseconds: 1000 });
const acquireRateLimit = async (key: string) => storeRateLimiter.acquire(key);

const processPublish = createPublishListingProcessor({
  database,
  connectors,
  cipher,
  acquireRateLimit,
});
const processTokenRefresh = createTokenRefreshProcessor({ database, connectors, cipher });
const processWebhookEvent = createWebhookEventProcessor({ database, connectors, cipher });
const processStockPriceSync = createStockPriceSyncProcessor({
  database,
  connectors,
  cipher,
  acquireRateLimit,
});
const processWebhookDeliveries = createWebhookDeliveryProcessor({
  database,
  cipher,
  allowPrivateUrls: environment.WEBHOOK_ALLOW_PRIVATE_URLS,
});

const publishWorker = new Worker(
  QUEUE_NAMES.publishListing,
  async (job) =>
    processPublish({
      data: job.data,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
    }),
  { connection, concurrency: environment.WORKER_CONCURRENCY, limiter: { max: 20, duration: 1000 } },
);

const tokenRefreshWorker = new Worker(QUEUE_NAMES.tokenRefresh, async () => processTokenRefresh(), {
  connection,
  concurrency: 1,
});

const webhookWorker = new Worker(
  QUEUE_NAMES.webhookEvents,
  async (job) =>
    processWebhookEvent({
      data: job.data,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
    }),
  { connection, concurrency: environment.WORKER_CONCURRENCY },
);

const stockPriceSyncWorker = new Worker(
  QUEUE_NAMES.stockPriceSync,
  async () => processStockPriceSync(),
  {
    connection,
    concurrency: 1,
  },
);

const publishQueue = new Queue(QUEUE_NAMES.publishListing, { connection });

/**
 * A finished job keeps its id in Redis (removeOnComplete/removeOnFail), and BullMQ silently
 * ignores a new job with that id: a recovery job that failed before touching the target (the
 * database was down) would block every later recovery of the same stale state.
 */
async function releaseFinishedJob(jobId: string): Promise<void> {
  const existing = await publishQueue.getJob(jobId);
  if (!existing) {
    return;
  }
  const state = await existing.getState();
  if (state === "completed" || state === "failed") {
    await existing.remove();
  }
}

async function enqueueRecoveredPublications(jobs: readonly RecoveryJob[]): Promise<void> {
  await Promise.all(jobs.map(({ jobId }) => releaseFinishedJob(jobId)));
  await publishQueue.addBulk(
    jobs.map(({ data, jobId }) => ({
      name: "publish",
      data,
      opts: {
        jobId,
        attempts: PUBLISH_JOB_ATTEMPTS,
        backoff: { type: "exponential", delay: PUBLISH_BACKOFF_MILLISECONDS },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    })),
  );
}

const processPublishRecovery = createPublishRecoveryProcessor({
  database,
  enqueue: enqueueRecoveredPublications,
});
const publishRecoveryWorker = new Worker(
  QUEUE_NAMES.publishRecovery,
  async () => processPublishRecovery(),
  { connection, concurrency: 1 },
);

const processTicketAutoClose = createTicketAutoCloseProcessor({ database });
const ticketAutoCloseWorker = new Worker(
  QUEUE_NAMES.ticketAutoClose,
  async () => processTicketAutoClose(),
  { connection, concurrency: 1 },
);

const webhookDeliveryWorker = new Worker(
  QUEUE_NAMES.webhookDelivery,
  async () => processWebhookDeliveries(),
  { connection, concurrency: 1 },
);

const tokenRefreshQueue = new Queue(QUEUE_NAMES.tokenRefresh, { connection });
const stockPriceSyncQueue = new Queue(QUEUE_NAMES.stockPriceSync, { connection });
await stockPriceSyncQueue.upsertJobScheduler(
  "sync-stock-and-price",
  { every: 15 * 60 * 1000 },
  { name: "sync-stock-and-price", data: {} },
);
const webhookDeliveryQueue = new Queue(QUEUE_NAMES.webhookDelivery, { connection });
await webhookDeliveryQueue.upsertJobScheduler(
  "deliver-outbound-webhooks",
  { every: 10 * 1000 },
  // Each run is a new job: keep only a few finished ones in Redis.
  { name: "deliver-outbound-webhooks", data: {}, opts: { removeOnComplete: 10, removeOnFail: 50 } },
);
const publishRecoveryQueue = new Queue(QUEUE_NAMES.publishRecovery, { connection });
await publishRecoveryQueue.upsertJobScheduler(
  "recover-publications",
  { every: 5 * 60 * 1000 },
  { name: "recover-publications", data: {}, opts: { removeOnComplete: 10, removeOnFail: 50 } },
);
const ticketAutoCloseQueue = new Queue(QUEUE_NAMES.ticketAutoClose, { connection });
await ticketAutoCloseQueue.upsertJobScheduler(
  "close-idle-tickets",
  { every: 60 * 60 * 1000 },
  { name: "close-idle-tickets", data: {}, opts: { removeOnComplete: 10, removeOnFail: 50 } },
);
await tokenRefreshQueue.upsertJobScheduler(
  "refresh-expiring-tokens",
  { every: 10 * 60 * 1000 },
  { name: "refresh-expiring-tokens", data: {} },
);

const workers = [
  publishWorker,
  tokenRefreshWorker,
  webhookWorker,
  stockPriceSyncWorker,
  webhookDeliveryWorker,
  publishRecoveryWorker,
  ticketAutoCloseWorker,
];
for (const worker of workers) {
  worker.on("failed", (job, error) => {
    logger.warn("job.failed", {
      queue: worker.name,
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error,
    });
  });
  worker.on("error", (error) => {
    logger.error("worker.error", { queue: worker.name, error });
  });
}

const healthServer = environment.WORKER_HEALTH_PORT
  ? startHealthServer(environment.WORKER_HEALTH_PORT, () => publishWorker.isRunning())
  : null;

logger.info("worker.started", { queues: workers.map((worker) => worker.name) });

async function shutdown(signal: string): Promise<void> {
  logger.info("worker.stopping", { signal });
  healthServer?.close();
  await Promise.all([
    ...workers.map(async (worker) => worker.close()),
    tokenRefreshQueue.close(),
    stockPriceSyncQueue.close(),
    webhookDeliveryQueue.close(),
    publishQueue.close(),
    publishRecoveryQueue.close(),
    ticketAutoCloseQueue.close(),
  ]);
  await database.$client.end();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
