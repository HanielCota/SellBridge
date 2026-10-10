import { createDatabase } from "@sellbridge/database/client";
import {
  createConnectorRegistry,
  createRateLimiter,
  createTokenCipher,
} from "@sellbridge/marketplaces";
import { logger } from "@sellbridge/shared/logger";
import { QUEUE_NAMES } from "@sellbridge/shared/queues";
import { Queue, Worker } from "bullmq";
import { startHealthServer } from "./health.ts";
import { environment } from "./environment.ts";
import { createPublishListingProcessor } from "./processors/publish-listing.ts";
import { createStockPriceSyncProcessor } from "./processors/stock-price-sync.ts";
import { createTokenRefreshProcessor } from "./processors/token-refresh.ts";
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

const tokenRefreshQueue = new Queue(QUEUE_NAMES.tokenRefresh, { connection });
const stockPriceSyncQueue = new Queue(QUEUE_NAMES.stockPriceSync, { connection });
await stockPriceSyncQueue.upsertJobScheduler(
  "sync-stock-and-price",
  { every: 15 * 60 * 1000 },
  { name: "sync-stock-and-price", data: {} },
);
await tokenRefreshQueue.upsertJobScheduler(
  "refresh-expiring-tokens",
  { every: 10 * 60 * 1000 },
  { name: "refresh-expiring-tokens", data: {} },
);

const workers = [publishWorker, tokenRefreshWorker, webhookWorker, stockPriceSyncWorker];
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
  ]);
  await database.$client.end();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
