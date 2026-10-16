import { createDatabase } from "@sellbridge/database/client";
import { createConnectorRegistry, getMercadoLivreShipping } from "@sellbridge/marketplaces";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { logger } from "@sellbridge/shared/logger";
import { createMailer } from "@sellbridge/shared/mailer";
import {
  AUTO_FORWARD_JOB_OPTIONS,
  autoForwardJobId,
  enqueueWebhookEventJob,
  PUBLISH_JOB_OPTIONS,
  QUEUE_NAMES,
  releaseFinishedJob,
  STOCK_SYNC_JOB_NAME,
  STOCK_SYNC_JOB_OPTIONS,
} from "@sellbridge/shared/queues";
import { withDeadline } from "@sellbridge/shared/deadline";
import { Queue, Worker } from "bullmq";
import { startHealthServer } from "./health.ts";
import { toJobContext } from "./lib/job-context.ts";
import { createRateLimiter } from "./lib/rate-limiter.ts";
import { environment } from "./environment.ts";
import { createPublishListingProcessor } from "./processors/publish-listing.ts";
import { createPublishRecoveryProcessor, type RecoveryJob } from "./processors/publish-recovery.ts";
import { createAutoForwardProcessor } from "./processors/order-auto-forward.ts";
import { createStockPriceSyncProcessor } from "./processors/stock-price-sync.ts";
import { createTicketAutoCloseProcessor } from "./processors/ticket-auto-close.ts";
import { createTokenRefreshProcessor } from "./processors/token-refresh.ts";
import { createWebhookDeliveryProcessor } from "./processors/webhook-delivery.ts";
import { createShipmentTrackingProcessor } from "./processors/shipment-tracking.ts";
import { createWebhookEventProcessor } from "./processors/webhook-event.ts";
import {
  createWebhookEventPruneProcessor,
  createWebhookEventSweepProcessor,
} from "./processors/webhook-event-sweep.ts";

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
const acquireRateLimit = storeRateLimiter.acquire;

const processPublish = createPublishListingProcessor({
  database,
  connectors,
  cipher,
  acquireRateLimit,
  safetyUnits: environment.STOCK_SAFETY_UNITS,
});
const sendEmail = createMailer({
  apiKey: environment.RESEND_API_KEY,
  from: environment.EMAIL_FROM,
  production: environment.NODE_ENV === "production",
});
const processTokenRefresh = createTokenRefreshProcessor({
  database,
  connectors,
  cipher,
  sendEmail,
  appUrl: environment.APP_URL,
});
const stockPriceSyncQueue = new Queue(QUEUE_NAMES.stockPriceSync, { connection });
const autoForwardQueue = new Queue(QUEUE_NAMES.orderAutoForward, { connection });
const mercadoLivreConfig = {
  clientId: environment.MERCADO_LIVRE_CLIENT_ID ?? "",
  clientSecret: environment.MERCADO_LIVRE_CLIENT_SECRET ?? "",
};
/** Off (the default), no job is queued at all: paid orders wait for the reseller as before. */
async function requestAutoForward(orderId: string): Promise<void> {
  if (!environment.AUTO_FORWARD_ENABLED) {
    return;
  }
  await withDeadline(
    autoForwardQueue.add(
      "forward-paid-order",
      { orderId },
      {
        ...AUTO_FORWARD_JOB_OPTIONS,
        jobId: autoForwardJobId(orderId),
      },
    ),
    3000,
    "Encaminhamento automático",
  );
}
const processAutoForward = createAutoForwardProcessor({
  database,
  cipher,
  readAddress: async (store, externalOrderId) =>
    (await getMercadoLivreShipping(mercadoLivreConfig, store, externalOrderId)).address,
  sendEmail,
  appUrl: environment.APP_URL,
  enabled: environment.AUTO_FORWARD_ENABLED,
});
const processWebhookEvent = createWebhookEventProcessor({
  database,
  connectors,
  cipher,
  // A follow-up job when one is running (it may have read the stock before this order), and
  // never more than one waiting (STOCK_SYNC_JOB_OPTIONS). Bounded wait: this connection
  // retries forever, and a Redis outage must not stall the job.
  requestStockSync: async () => {
    await withDeadline(
      stockPriceSyncQueue.add(STOCK_SYNC_JOB_NAME, {}, STOCK_SYNC_JOB_OPTIONS),
      3000,
      "Sincronização do estoque",
    );
  },
  requestAutoForward,
});
const processStockPriceSync = createStockPriceSyncProcessor({
  database,
  connectors,
  cipher,
  acquireRateLimit,
  safetyUnits: environment.STOCK_SAFETY_UNITS,
});
const processWebhookDeliveries = createWebhookDeliveryProcessor({
  database,
  cipher,
  allowPrivateUrls: environment.WEBHOOK_ALLOW_PRIVATE_URLS,
});

const publishWorker = new Worker(
  QUEUE_NAMES.publishListing,
  async (job) => processPublish(toJobContext(job)),
  { connection, concurrency: environment.WORKER_CONCURRENCY, limiter: { max: 20, duration: 1000 } },
);

const tokenRefreshWorker = new Worker(QUEUE_NAMES.tokenRefresh, async () => processTokenRefresh(), {
  connection,
  concurrency: 1,
});

const webhookWorker = new Worker(
  QUEUE_NAMES.webhookEvents,
  async (job) => processWebhookEvent(toJobContext(job)),
  { connection, concurrency: environment.WORKER_CONCURRENCY },
);

const autoForwardWorker = new Worker(
  QUEUE_NAMES.orderAutoForward,
  async (job) => processAutoForward(toJobContext(job)),
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
 * A recovery job that failed before touching the target (the database was down) keeps its id,
 * so it is released first or it would block every later recovery of the same stale state.
 */
async function enqueueRecoveredPublications(jobs: readonly RecoveryJob[]): Promise<void> {
  await Promise.all(jobs.map(async ({ jobId }) => releaseFinishedJob(publishQueue, jobId)));
  await publishQueue.addBulk(
    jobs.map(({ data, jobId }) => ({
      name: "publish",
      data,
      opts: { ...PUBLISH_JOB_OPTIONS, jobId },
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

const webhookEventQueue = new Queue(QUEUE_NAMES.webhookEvents, { connection });
const processWebhookEventSweep = createWebhookEventSweepProcessor({
  database,
  enqueue: async (webhookEventId) => enqueueWebhookEventJob(webhookEventQueue, webhookEventId),
});
const processWebhookEventPrune = createWebhookEventPruneProcessor({ database });
const WEBHOOK_EVENT_PRUNE_JOB = "prune-webhook-events";
const webhookEventSweepWorker = new Worker(
  QUEUE_NAMES.webhookEventSweep,
  async (job) =>
    job.name === WEBHOOK_EVENT_PRUNE_JOB ? processWebhookEventPrune() : processWebhookEventSweep(),
  { connection, concurrency: 1 },
);

const processShipmentTracking = createShipmentTrackingProcessor({
  database,
  cipher,
  readShipping: async (store, externalOrderId) =>
    getMercadoLivreShipping(mercadoLivreConfig, store, externalOrderId),
  requestStockSync: async () => {
    await withDeadline(
      stockPriceSyncQueue.add(STOCK_SYNC_JOB_NAME, {}, STOCK_SYNC_JOB_OPTIONS),
      3000,
      "Sincronização do estoque",
    );
  },
});
const shipmentTrackingWorker = new Worker(
  QUEUE_NAMES.shipmentTracking,
  async () => processShipmentTracking(),
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

/** Each run is a new job: keep only a few finished ones in Redis. */
async function scheduleRecurring(queue: Queue, id: string, every: number): Promise<void> {
  await queue.upsertJobScheduler(
    id,
    { every },
    { name: id, data: {}, opts: { removeOnComplete: 10, removeOnFail: 50 } },
  );
}

const tokenRefreshQueue = new Queue(QUEUE_NAMES.tokenRefresh, { connection });
const webhookDeliveryQueue = new Queue(QUEUE_NAMES.webhookDelivery, { connection });
const publishRecoveryQueue = new Queue(QUEUE_NAMES.publishRecovery, { connection });
const webhookEventSweepQueue = new Queue(QUEUE_NAMES.webhookEventSweep, { connection });
const ticketAutoCloseQueue = new Queue(QUEUE_NAMES.ticketAutoClose, { connection });
const shipmentTrackingQueue = new Queue(QUEUE_NAMES.shipmentTracking, { connection });
await scheduleRecurring(stockPriceSyncQueue, STOCK_SYNC_JOB_NAME, 15 * 60 * 1000);
await scheduleRecurring(webhookDeliveryQueue, "deliver-outbound-webhooks", 10 * 1000);
await scheduleRecurring(publishRecoveryQueue, "recover-publications", 5 * 60 * 1000);
await scheduleRecurring(webhookEventSweepQueue, "sweep-unprocessed-webhook-events", 5 * 60 * 1000);
await scheduleRecurring(webhookEventSweepQueue, WEBHOOK_EVENT_PRUNE_JOB, 60 * 60 * 1000);
await scheduleRecurring(ticketAutoCloseQueue, "close-idle-tickets", 60 * 60 * 1000);
await scheduleRecurring(tokenRefreshQueue, "refresh-expiring-tokens", 10 * 60 * 1000);
await scheduleRecurring(shipmentTrackingQueue, "track-shipments", 30 * 60 * 1000);

const workers = [
  publishWorker,
  tokenRefreshWorker,
  webhookWorker,
  stockPriceSyncWorker,
  webhookDeliveryWorker,
  publishRecoveryWorker,
  webhookEventSweepWorker,
  ticketAutoCloseWorker,
  shipmentTrackingWorker,
  autoForwardWorker,
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
    webhookEventQueue.close(),
    webhookEventSweepQueue.close(),
    ticketAutoCloseQueue.close(),
    shipmentTrackingQueue.close(),
    autoForwardQueue.close(),
  ]);
  await database.$client.end();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
