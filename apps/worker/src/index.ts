import { createDatabase } from "@sellbridge/db/client";
import {
  createConnectorRegistry,
  createRateLimiter,
  createTokenCipher,
} from "@sellbridge/marketplaces";
import { logger } from "@sellbridge/shared/logger";
import { QUEUE_NAMES } from "@sellbridge/shared/queues";
import { Queue, Worker } from "bullmq";
import { startHealthServer } from "./health.ts";
import { env } from "./env.ts";
import { createPublishListingProcessor } from "./processors/publish-listing.ts";
import { createTokenRefreshProcessor } from "./processors/token-refresh.ts";

const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null };
const db = createDatabase(env.DATABASE_URL);
const cipher = createTokenCipher(env.TOKEN_ENCRYPTION_KEY);
const connectors = createConnectorRegistry({
  appUrl: env.APP_URL,
  mockWebhookSecret: env.MOCK_WEBHOOK_SECRET,
  mockLatencyMs: env.MOCK_LATENCY_MS,
});
const storeRateLimiter = createRateLimiter({ tokensPerInterval: 5, intervalMs: 1000 });

const processPublish = createPublishListingProcessor({
  db,
  connectors,
  cipher,
  acquireRateLimit: (key) => storeRateLimiter.acquire(key),
});
const processTokenRefresh = createTokenRefreshProcessor({ db, connectors, cipher });

const publishWorker = new Worker(
  QUEUE_NAMES.publishListing,
  async (job) =>
    processPublish({
      data: job.data,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
    }),
  { connection, concurrency: env.WORKER_CONCURRENCY, limiter: { max: 20, duration: 1000 } },
);

const tokenRefreshWorker = new Worker(QUEUE_NAMES.tokenRefresh, async () => processTokenRefresh(), {
  connection,
  concurrency: 1,
});

const tokenRefreshQueue = new Queue(QUEUE_NAMES.tokenRefresh, { connection });
await tokenRefreshQueue.upsertJobScheduler(
  "refresh-expiring-tokens",
  { every: 10 * 60 * 1000 },
  { name: "refresh-expiring-tokens", data: {} },
);

for (const worker of [publishWorker, tokenRefreshWorker]) {
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

const healthServer = env.WORKER_HEALTH_PORT
  ? startHealthServer(env.WORKER_HEALTH_PORT, () => publishWorker.isRunning())
  : null;

logger.info("worker.started", { queues: [publishWorker.name, tokenRefreshWorker.name] });

async function shutdown(signal: string): Promise<void> {
  logger.info("worker.stopping", { signal });
  healthServer?.close();
  await Promise.all([publishWorker.close(), tokenRefreshWorker.close(), tokenRefreshQueue.close()]);
  await db.$client.end();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
