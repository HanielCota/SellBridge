import { createDatabase } from "@sellbridge/database/client";
import { deliverOrderMessageNotice, orderMessageMoments } from "@sellbridge/database/repositories";
import { getMercadoLivreShipping, type ConnectorRegistry } from "@sellbridge/marketplaces";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { installErrorAlerts } from "@sellbridge/shared/error-alerts";
import { logger } from "@sellbridge/shared/logger";
import { createMailer } from "@sellbridge/shared/mailer";
import {
  AUTO_FORWARD_JOB_OPTIONS,
  autoForwardJobId,
  enqueueWebhookEventJob,
  pingQueueConnection,
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
import { createNotificationDeliveryProcessor } from "./processors/notification-delivery.ts";
import { createOrderMessageFollowUpProcessor } from "./processors/order-message-follow-up.ts";
import { createWebhookDeliveryProcessor } from "./processors/webhook-delivery.ts";
import { createShipmentTrackingProcessor } from "./processors/shipment-tracking.ts";
import { createWebhookEventProcessor } from "./processors/webhook-event.ts";
import {
  createWebhookEventPruneProcessor,
  createWebhookEventSweepProcessor,
} from "./processors/webhook-event-sweep.ts";

function createQueues(connection: { url: string; maxRetriesPerRequest: null }) {
  return {
    publish: new Queue(QUEUE_NAMES.publishListing, { connection }),
    stock: new Queue(QUEUE_NAMES.stockPriceSync, { connection }),
    autoForward: new Queue(QUEUE_NAMES.orderAutoForward, { connection }),
    webhookEvents: new Queue(QUEUE_NAMES.webhookEvents, { connection }),
    tokenRefresh: new Queue(QUEUE_NAMES.tokenRefresh, { connection }),
    webhookDelivery: new Queue(QUEUE_NAMES.webhookDelivery, { connection }),
    publishRecovery: new Queue(QUEUE_NAMES.publishRecovery, { connection }),
    webhookSweep: new Queue(QUEUE_NAMES.webhookEventSweep, { connection }),
    ticketClose: new Queue(QUEUE_NAMES.ticketAutoClose, { connection }),
    shipmentTracking: new Queue(QUEUE_NAMES.shipmentTracking, { connection }),
    notifications: new Queue(QUEUE_NAMES.notificationDelivery, { connection }),
  };
}

function createContext(connectors: ConnectorRegistry) {
  const connection = { url: environment.REDIS_URL, maxRetriesPerRequest: null };
  return {
    connection,
    connectors,
    queues: createQueues(connection),
    database: createDatabase(environment.DATABASE_URL),
    cipher: createTokenCipher(environment.TOKEN_ENCRYPTION_KEY),
    acquireRateLimit: createRateLimiter({ tokensPerInterval: 5, intervalMilliseconds: 1000 })
      .acquire,
    sendEmail: createMailer({
      apiKey: environment.RESEND_API_KEY,
      from: environment.EMAIL_FROM,
      production: environment.NODE_ENV === "production",
    }),
    mercadoLivreConfig: {
      clientId: environment.MERCADO_LIVRE_CLIENT_ID ?? "",
      clientSecret: environment.MERCADO_LIVRE_CLIENT_SECRET ?? "",
    },
  };
}

type WorkerContext = ReturnType<typeof createContext>;

async function requestStockSync(context: WorkerContext): Promise<void> {
  await withDeadline(
    context.queues.stock.add(STOCK_SYNC_JOB_NAME, {}, STOCK_SYNC_JOB_OPTIONS),
    3000,
    "Sincronização do estoque",
  );
}

async function requestAutoForward(context: WorkerContext, orderId: string): Promise<void> {
  if (!environment.AUTO_FORWARD_ENABLED) return;
  await withDeadline(
    context.queues.autoForward.add(
      "forward-paid-order",
      { orderId },
      { ...AUTO_FORWARD_JOB_OPTIONS, jobId: autoForwardJobId(orderId) },
    ),
    3000,
    "Encaminhamento automático",
  );
}

function marketplaceWorkers(context: WorkerContext): Worker[] {
  const { database, connectors, cipher, acquireRateLimit, connection } = context;
  const options = {
    database,
    connectors,
    cipher,
    acquireRateLimit,
    safetyUnits: environment.STOCK_SAFETY_UNITS,
    showcaseUnits: environment.SHOPEE_SHOWCASE_UNITS,
  };
  const processPublish = createPublishListingProcessor(options);
  const processStock = createStockPriceSyncProcessor(options);
  const processRefresh = createTokenRefreshProcessor({ database, connectors, cipher });
  return [
    new Worker(QUEUE_NAMES.publishListing, async (job) => processPublish(toJobContext(job)), {
      connection,
      concurrency: environment.WORKER_CONCURRENCY,
      limiter: { max: 20, duration: 1000 },
    }),
    new Worker(QUEUE_NAMES.stockPriceSync, async () => processStock(), {
      connection,
      concurrency: 1,
    }),
    new Worker(QUEUE_NAMES.tokenRefresh, async () => processRefresh(), {
      connection,
      concurrency: 1,
    }),
  ];
}

function orderWorkers(context: WorkerContext): Worker[] {
  const { database, connectors, cipher, connection, mercadoLivreConfig, sendEmail } = context;
  const processWebhook = createWebhookEventProcessor({
    database,
    connectors,
    cipher,
    requestStockSync: async () => requestStockSync(context),
    requestAutoForward: async (orderId) => requestAutoForward(context, orderId),
  });
  const processAutoForward = createAutoForwardProcessor({
    database,
    cipher,
    readAddress: async (store, externalOrderId) =>
      (await getMercadoLivreShipping(mercadoLivreConfig, store, externalOrderId)).address,
    sendEmail,
    appUrl: environment.APP_URL,
    enabled: environment.AUTO_FORWARD_ENABLED,
  });
  const processTracking = createShipmentTrackingProcessor({
    database,
    cipher,
    readShipping: async (store, externalOrderId) =>
      getMercadoLivreShipping(mercadoLivreConfig, store, externalOrderId),
    requestStockSync: async () => requestStockSync(context),
  });
  return [
    new Worker(QUEUE_NAMES.webhookEvents, async (job) => processWebhook(toJobContext(job)), {
      connection,
      concurrency: environment.WORKER_CONCURRENCY,
    }),
    new Worker(QUEUE_NAMES.orderAutoForward, async (job) => processAutoForward(toJobContext(job)), {
      connection,
      concurrency: environment.WORKER_CONCURRENCY,
    }),
    new Worker(QUEUE_NAMES.shipmentTracking, async () => processTracking(), {
      connection,
      concurrency: 1,
    }),
  ];
}

/** Release completed job IDs before recovery, so an earlier failed attempt cannot block a retry. */
async function enqueueRecoveredPublications(
  queue: Queue,
  jobs: readonly RecoveryJob[],
): Promise<void> {
  await Promise.all(jobs.map(async ({ jobId }) => releaseFinishedJob(queue, jobId)));
  await queue.addBulk(
    jobs.map(({ data, jobId }) => ({
      name: "publish",
      data,
      opts: { ...PUBLISH_JOB_OPTIONS, jobId },
    })),
  );
}

const WEBHOOK_EVENT_PRUNE_JOB = "prune-webhook-events";

function recoveryWorkers(context: WorkerContext): Worker[] {
  const { database, queues, connection } = context;
  const processRecovery = createPublishRecoveryProcessor({
    database,
    enqueue: async (jobs) => enqueueRecoveredPublications(queues.publish, jobs),
  });
  const processSweep = createWebhookEventSweepProcessor({
    database,
    enqueue: async (id) => enqueueWebhookEventJob(queues.webhookEvents, id),
  });
  const processPrune = createWebhookEventPruneProcessor({ database });
  return [
    new Worker(QUEUE_NAMES.publishRecovery, async () => processRecovery(), {
      connection,
      concurrency: 1,
    }),
    new Worker(
      QUEUE_NAMES.webhookEventSweep,
      async (job) => (job.name === WEBHOOK_EVENT_PRUNE_JOB ? processPrune() : processSweep()),
      { connection, concurrency: 1 },
    ),
  ];
}

function deliveryWorkers(context: WorkerContext): Worker[] {
  const { database, cipher, sendEmail, connection } = context;
  const processTickets = createTicketAutoCloseProcessor({ database });
  const processWebhooks = createWebhookDeliveryProcessor({
    database,
    cipher,
    allowPrivateUrls: environment.WEBHOOK_ALLOW_PRIVATE_URLS,
  });
  const processNotifications = createNotificationDeliveryProcessor({
    database,
    sendEmail,
    appUrl: environment.APP_URL,
  });
  const processMessages = createOrderMessageFollowUpProcessor({
    loadMessages: async (shipmentId) => orderMessageMoments(database, shipmentId),
    deliver: async (notice) =>
      deliverOrderMessageNotice({ database, sendEmail, appUrl: environment.APP_URL }, notice),
  });
  return [
    new Worker(QUEUE_NAMES.ticketAutoClose, async () => processTickets(), {
      connection,
      concurrency: 1,
    }),
    new Worker(QUEUE_NAMES.webhookDelivery, async () => processWebhooks(), {
      connection,
      concurrency: 1,
    }),
    new Worker(QUEUE_NAMES.notificationDelivery, async () => processNotifications(), {
      connection,
      concurrency: 1,
    }),
    new Worker(
      QUEUE_NAMES.orderMessageFollowUp,
      async (job) => processMessages(toJobContext(job)),
      { connection, concurrency: environment.WORKER_CONCURRENCY },
    ),
  ];
}

async function scheduleRecurring(queue: Queue, id: string, every: number): Promise<void> {
  await queue.upsertJobScheduler(
    id,
    { every },
    { name: id, data: {}, opts: { removeOnComplete: 10, removeOnFail: 50 } },
  );
}

async function scheduleQueues(queues: WorkerContext["queues"]): Promise<void> {
  await scheduleRecurring(queues.stock, STOCK_SYNC_JOB_NAME, 15 * 60 * 1000);
  await scheduleRecurring(queues.webhookDelivery, "deliver-outbound-webhooks", 10 * 1000);
  await scheduleRecurring(queues.notifications, "deliver-notifications", 10 * 1000);
  await scheduleRecurring(queues.publishRecovery, "recover-publications", 5 * 60 * 1000);
  await scheduleRecurring(queues.webhookSweep, "sweep-unprocessed-webhook-events", 5 * 60 * 1000);
  await scheduleRecurring(queues.webhookSweep, WEBHOOK_EVENT_PRUNE_JOB, 60 * 60 * 1000);
  await scheduleRecurring(queues.ticketClose, "close-idle-tickets", 60 * 60 * 1000);
  await scheduleRecurring(queues.tokenRefresh, "refresh-expiring-tokens", 10 * 60 * 1000);
  await scheduleRecurring(queues.shipmentTracking, "track-shipments", 30 * 60 * 1000);
}

function observeWorkers(workers: readonly Worker[]): void {
  for (const worker of workers) {
    worker.on("failed", (job, error) =>
      logger.warn("job.failed", {
        queue: worker.name,
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        error,
      }),
    );
    worker.on("error", (error) => logger.error("worker.error", { queue: worker.name, error }));
  }
}

function serveHealth(context: WorkerContext, workers: readonly Worker[]) {
  if (!environment.WORKER_HEALTH_PORT) return null;
  return startHealthServer(environment.WORKER_HEALTH_PORT, [
    {
      name: "worker",
      critical: true,
      run: async () => workers.every((worker) => worker.isRunning()),
    },
    { name: "redis", critical: true, run: async () => pingQueueConnection(context.queues.publish) },
  ]);
}

/** Bound shutdown so BullMQ can return unfinished work before the container's forced exit. */
function registerShutdown(
  context: WorkerContext,
  workers: readonly Worker[],
  healthServer: ReturnType<typeof serveHealth>,
): void {
  async function shutdown(signal: string): Promise<void> {
    logger.info("worker.stopping", { signal });
    const forcedExit = setTimeout(() => {
      logger.error("worker.shutdown_timed_out", { signal, graceMilliseconds: 25_000 });
      process.exit(1);
    }, 25_000);
    forcedExit.unref();
    healthServer?.close();
    const closings = await Promise.allSettled([
      ...workers.map(async (worker) => worker.close()),
      ...Object.values(context.queues).map(async (queue) => queue.close()),
    ]);
    for (const closing of closings) {
      if (closing.status === "rejected")
        logger.error("worker.close_failed", { error: closing.reason });
    }
    await context.database.$client.end({ timeout: 5 });
    process.exit(0);
  }
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

/** Start with explicit adapters; the normal entry point always supplies the real registry. */
export async function startWorker(connectors: ConnectorRegistry): Promise<void> {
  installErrorAlerts({ webhookUrl: environment.ALERT_WEBHOOK_URL, service: "worker" });
  const context = createContext(connectors);
  const workers = [
    ...marketplaceWorkers(context),
    ...orderWorkers(context),
    ...recoveryWorkers(context),
    ...deliveryWorkers(context),
  ];
  observeWorkers(workers);
  // Expose health before scheduling: a Redis outage must not leave probes waiting for startup.
  const healthServer = serveHealth(context, workers);
  registerShutdown(context, workers, healthServer);
  await scheduleQueues(context.queues);
  logger.info("worker.started", { queues: workers.map((worker) => worker.name) });
}
