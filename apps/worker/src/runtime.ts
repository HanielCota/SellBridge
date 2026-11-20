import { createDatabase } from "@sellbridge/database/client";
import {
  deliverOrderMessageNotice,
  listPendingSupplierIds,
  orderMessageMoments,
  runSupplierApprovalCheck,
} from "@sellbridge/database/repositories";
import {
  getMercadoLivreShipping,
  parseMercadoLivreNotice,
  readMercadoLivreAccountAddresses,
  readMercadoLivreBuyerBilling,
  readMercadoLivreSaleInvoice,
  readMercadoLivreClaim,
  readMercadoLivreShipmentOrders,
  searchMercadoLivreClaims,
  type ConnectorRegistry,
  type FetchLike,
  type MercadoLivreConfig,
} from "@sellbridge/marketplaces";
import { createBlingRateLimiter, type BlingAppCredentials } from "@sellbridge/marketplaces/bling";
import { asaasSettingsFrom } from "@sellbridge/payments/asaas";
import { mercadoPagoSettingsFrom } from "@sellbridge/payments/mercado-pago";
import { createRedisSlotStore } from "@sellbridge/shared/redis-slots";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { createCnpjLookup } from "@sellbridge/shared/cnpj-lookup";
import { installErrorAlerts } from "@sellbridge/shared/error-alerts";
import { installProblemRecorder } from "@sellbridge/database/problem-recorder";
import { installPortugueseZodMessages } from "@sellbridge/shared/zod-messages";
import { logger } from "@sellbridge/shared/logger";
import { createMailer } from "@sellbridge/shared/mailer";
import { createEmailQuota } from "@sellbridge/shared/email-quota";
import { createRedisEmailQuotaStore } from "@sellbridge/shared/redis-email-quota-store";
import {
  AUTO_FORWARD_JOB_OPTIONS,
  autoForwardJobId,
  enqueueStoreOrderCatchUpJob,
  enqueueWebhookEventJob,
  ERP_STOCK_JOB_NAMES,
  ERP_STOCK_JOB_OPTIONS,
  erpStockCheckJobId,
  erpStockSupplierJobSchema,
  ORDER_CHECK_JOB_OPTIONS,
  type OrderCheckJob,
  orderCheckJobId,
  orderCheckJobSchema,
  pingQueueConnection,
  PUBLISH_JOB_OPTIONS,
  QUEUE_NAMES,
  releaseFinishedJob,
  RETURN_DEADLINES_JOB_NAME,
  STOCK_SYNC_JOB_NAME,
  STOCK_SYNC_JOB_OPTIONS,
} from "@sellbridge/shared/queues";
import { withDeadline } from "@sellbridge/shared/deadline";
import { Queue, UnrecoverableError, Worker } from "bullmq";
import { startHealthServer } from "./health.ts";
import { isLastAttempt, toJobContext } from "./lib/job-context.ts";
import { reportJobFailure } from "./lib/job-failure-report.ts";
import { createRateLimiter } from "./lib/rate-limiter.ts";
import { environment } from "./environment.ts";
import { createPublishListingProcessor } from "./processors/publish-listing.ts";
import { createPublishRecoveryProcessor, type RecoveryJob } from "./processors/publish-recovery.ts";
import { createAutoForwardProcessor } from "./processors/order-auto-forward.ts";
import { createStockPriceSyncProcessor } from "./processors/stock-price-sync.ts";
import { createAsaasPaymentProcessor } from "./processors/asaas-payments.ts";
import { runPaymentRounds } from "./processors/payment-rounds.ts";
import { createSupplierPaymentProcessor } from "./processors/supplier-payments.ts";
import { createReturnDeadlinesProcessor } from "./processors/return-deadlines.ts";
import { createTicketAutoCloseProcessor } from "./processors/ticket-auto-close.ts";
import { createSupplierApprovalProcessor } from "./processors/supplier-approval.ts";
import { createBuyerAddressCheckProcessor } from "./processors/buyer-address-check.ts";
import { createTokenRefreshProcessor } from "./processors/token-refresh.ts";
import {
  createErpTokenRefreshProcessor,
  runTokenRefreshes,
} from "./processors/erp-token-refresh.ts";
import { createErpCatalogExportProcessor } from "./processors/erp-catalog-export.ts";
import { createErpCatalogReadProcessor } from "./processors/erp-catalog-read.ts";
import { createErpInvoiceProcessor } from "./processors/erp-invoice-issue.ts";
import { postDueErpStockEntries, postDueErpStockExits } from "./processors/erp-stock-exit.ts";
import {
  checkAllErpStock,
  checkSupplierErpStock,
  refreshSupplierErpStock,
  type ErpStockSyncDependencies,
} from "./processors/erp-stock-sync.ts";
import { createResellerInvoiceReadProcessor } from "./processors/reseller-invoice-read.ts";
import { resolveStoreCredentials } from "./lib/store-access.ts";
import { createNotificationDeliveryProcessor } from "./processors/notification-delivery.ts";
import { blingInvoiceFileReader, createInvoiceAttachments } from "./lib/invoice-attachments.ts";
import { createDeletedStorePauseProcessor } from "./processors/deleted-store-pause.ts";
import { createOrderMessageFollowUpProcessor } from "./processors/order-message-follow-up.ts";
import { createWebhookDeliveryProcessor } from "./processors/webhook-delivery.ts";
import { createShipmentTrackingProcessor } from "./processors/shipment-tracking.ts";
import { createClaimSweepProcessor } from "./processors/marketplace-claim-sweep.ts";
import {
  checkStoreOrders,
  createOrderCheckDispatcher,
  ORDER_CHECK_DISPATCH_JOB,
  ORDER_CHECK_MARKETPLACES,
} from "./processors/order-check.ts";
import type { NoticeReaders } from "./processors/marketplace-notice.ts";
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
    claimSweep: new Queue(QUEUE_NAMES.marketplaceClaimSweep, { connection }),
    notifications: new Queue(QUEUE_NAMES.notificationDelivery, { connection }),
    erpInvoices: new Queue(QUEUE_NAMES.erpInvoiceIssue, { connection }),
    erpStock: new Queue(QUEUE_NAMES.erpStockSync, { connection }),
    supplierPayments: new Queue(QUEUE_NAMES.supplierPayments, { connection }),
    supplierApproval: new Queue(QUEUE_NAMES.supplierApproval, { connection }),
    buyerAddressCheck: new Queue(QUEUE_NAMES.buyerAddressCheck, { connection }),
    orderCheck: new Queue(QUEUE_NAMES.orderCheck, { connection }),
  };
}

/** The Bling app keys, or null while they are not set: ERP jobs then do nothing. */
function blingCredentials(): BlingAppCredentials | null {
  const clientId = environment.BLING_CLIENT_ID;
  const clientSecret = environment.BLING_CLIENT_SECRET;
  if (clientId === undefined || clientSecret === undefined) {
    return null;
  }
  return { clientId, clientSecret };
}

/** Test entry points only. */
export interface WorkerOptions {
  /** Where the purchase address checks read Mercado Livre instead of the real API. */
  accountAddressFetch?: FetchLike;
  /** Where the Bling stock sync calls Bling instead of the real API (the browser tests). */
  erpStockFetch?: FetchLike;
}

function createContext(connectors: ConnectorRegistry, options: WorkerOptions) {
  const connection = { url: environment.REDIS_URL, maxRetriesPerRequest: null };
  const queues = createQueues(connection);
  return {
    connection,
    connectors,
    queues,
    /** The Bling quota is per account and shared with the web app: its slots live in Redis. */
    blingLimiter: createBlingRateLimiter({
      sharedSlots: createRedisSlotStore(queues.erpInvoices, "bling"),
    }),
    database: createDatabase(environment.DATABASE_URL),
    cipher: createTokenCipher(environment.TOKEN_ENCRYPTION_KEY),
    acquireRateLimit: createRateLimiter({ tokensPerInterval: 5, intervalMilliseconds: 1000 })
      .acquire,
    sendEmail: createMailer({
      apiKey: environment.RESEND_API_KEY,
      from: environment.EMAIL_FROM,
      production: environment.NODE_ENV === "production",
      // The same counters the web app uses: the allowance is of the product, not of a process.
      quota: createEmailQuota({
        store: createRedisEmailQuotaStore(queues.notifications),
        limits: {
          accountDaily: environment.EMAIL_ACCOUNT_DAILY_CAP,
          accountPerRecipientDaily: environment.EMAIL_ACCOUNT_DAILY_CAP_PER_RECIPIENT,
          generalDaily: environment.EMAIL_DAILY_CAP,
          generalPerRecipientDaily: environment.EMAIL_DAILY_CAP_PER_RECIPIENT,
        },
      }),
    }),
    mercadoLivreConfig: {
      clientId: environment.MERCADO_LIVRE_CLIENT_ID ?? "",
      clientSecret: environment.MERCADO_LIVRE_CLIENT_SECRET ?? "",
    },
    accountAddressFetch: options.accountAddressFetch,
    erpStockFetch: options.erpStockFetch,
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
  const processDeletedStorePause = createDeletedStorePauseProcessor({ connectors, cipher });
  const processErpRefresh = createErpTokenRefreshProcessor({
    database,
    cipher,
    blingCredentials: blingCredentials(),
    fetchImplementation: fetch,
  });
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
    new Worker(
      QUEUE_NAMES.deletedStorePause,
      async (job) => processDeletedStorePause(toJobContext(job)),
      { connection, concurrency: 1 },
    ),
    new Worker(
      QUEUE_NAMES.tokenRefresh,
      async () => runTokenRefreshes({ stores: processRefresh, erp: processErpRefresh }),
      { connection, concurrency: 1 },
    ),
  ];
}

/** Runs one ERP stock job by name: the periodic round, a full check or a notice's read. */
async function runErpStockJob(
  dependencies: ErpStockSyncDependencies,
  job: { name: string; data: unknown },
): Promise<unknown> {
  if (job.name === ERP_STOCK_JOB_NAMES.checkAll) {
    return checkAllErpStock(dependencies);
  }
  if (job.name === ERP_STOCK_JOB_NAMES.postExits) {
    // The same minute's sweep posts the returns' entries: both are SellBridge's own movements.
    const exits = await postDueErpStockExits(dependencies);
    const entries = await postDueErpStockEntries(dependencies);
    return { exits, entries };
  }
  const { supplierId } = erpStockSupplierJobSchema.parse(job.data);
  if (job.name === ERP_STOCK_JOB_NAMES.checkSupplier) {
    return checkSupplierErpStock(dependencies, supplierId);
  }
  if (job.name === ERP_STOCK_JOB_NAMES.refreshSupplier) {
    return refreshSupplierErpStock(dependencies, supplierId);
  }
  throw new Error(`Unknown ERP stock job: ${job.name}`);
}

/** Stock of Bling-linked products: several suppliers at once, each within its own Bling quota. */
function erpStockWorker(
  context: WorkerContext,
  erpDependencies: Omit<ErpStockSyncDependencies, "requestListingSync" | "enqueueSupplierCheck">,
): Worker {
  const dependencies: ErpStockSyncDependencies = {
    ...erpDependencies,
    fetchImplementation: context.erpStockFetch ?? erpDependencies.fetchImplementation,
    requestListingSync: async () => requestStockSync(context),
    enqueueSupplierCheck: async (supplierId) => {
      await context.queues.erpStock.add(
        ERP_STOCK_JOB_NAMES.checkSupplier,
        { supplierId },
        { ...ERP_STOCK_JOB_OPTIONS, jobId: erpStockCheckJobId({ supplierId }) },
      );
    },
  };
  return new Worker(QUEUE_NAMES.erpStockSync, async (job) => runErpStockJob(dependencies, job), {
    connection: context.connection,
    concurrency: 3,
  });
}

function createResellerInvoiceReader(context: WorkerContext) {
  const { database, cipher, mercadoLivreConfig } = context;
  return createResellerInvoiceReadProcessor({
    database,
    readSaleInvoice: async (due) => {
      if (due.store.marketplace !== "mercado_livre") {
        return null;
      }

      const store = resolveStoreCredentials(cipher, due.store);
      if (store === null) {
        return null;
      }

      return readMercadoLivreSaleInvoice(mercadoLivreConfig, store, due.externalOrderId);
    },
  });
}

/** The supplier's catalog sent to its ERP; one at a time, the ERP quota is per account. */
function erpWorkers(context: WorkerContext): Worker[] {
  const dependencies = {
    database: context.database,
    cipher: context.cipher,
    blingCredentials: blingCredentials(),
    limiter: context.blingLimiter,
    fetchImplementation: fetch,
  };
  const processExport = createErpCatalogExportProcessor(dependencies);
  const processRead = createErpCatalogReadProcessor(dependencies);
  const processInvoices = createErpInvoiceProcessor({
    ...dependencies,
    readBuyerBilling: async (work) => {
      if (work.store.marketplace !== "mercado_livre") {
        return null;
      }
      const store = resolveStoreCredentials(context.cipher, work.store);
      if (store === null) {
        return null;
      }
      return readMercadoLivreBuyerBilling(context.mercadoLivreConfig, store, work.externalOrderId);
    },
  });
  const readResellerInvoices = createResellerInvoiceReader(context);
  return [
    erpStockWorker(context, dependencies),
    new Worker(
      QUEUE_NAMES.erpCatalogExport,
      async (job) => processExport(job.data, { isLast: isLastAttempt(job) }),
      {
        connection: context.connection,
        concurrency: 1,
      },
    ),
    new Worker(QUEUE_NAMES.erpCatalogRead, async (job) => processRead(job.data), {
      connection: context.connection,
      concurrency: 2,
    }),
    // The reseller's note comes first: in venda à ordem the supplier's notes reference it.
    new Worker(
      QUEUE_NAMES.erpInvoiceIssue,
      async () => ({
        resellerNotes: await readResellerInvoices(),
        ...(await processInvoices()),
      }),
      {
        connection: context.connection,
        concurrency: 1,
      },
    ),
  ];
}

/** Shipment and claim notifications, read with Mercado Livre's API; other marketplaces send none. */
function mercadoLivreNoticeReaders(config: MercadoLivreConfig): NoticeReaders {
  return {
    parseNotice: (marketplace, topic, rawPayload) =>
      marketplace === "mercado_livre" ? parseMercadoLivreNotice(topic, rawPayload) : null,
    readShipmentOrders: async (store, shipmentId) =>
      readMercadoLivreShipmentOrders(config, store, shipmentId),
    readShipping: async (store, externalOrderId) =>
      getMercadoLivreShipping(config, store, externalOrderId),
    readClaim: async (store, claimId) => readMercadoLivreClaim(config, store, claimId),
  };
}

function orderWorkers(context: WorkerContext): Worker[] {
  const { database, connectors, cipher, connection, mercadoLivreConfig, sendEmail } = context;
  const processWebhook = createWebhookEventProcessor({
    database,
    connectors,
    cipher,
    acquireRateLimit: context.acquireRateLimit,
    requestStockSync: async () => requestStockSync(context),
    requestAutoForward: async (orderId) => requestAutoForward(context, orderId),
    requestCatchUp: async (job) => enqueueStoreOrderCatchUpJob(context.queues.webhookEvents, job),
    notices: mercadoLivreNoticeReaders(mercadoLivreConfig),
  });
  const processClaimSweep = createClaimSweepProcessor({
    database,
    cipher,
    acquireRateLimit: context.acquireRateLimit,
    readers: mercadoLivreNoticeReaders(mercadoLivreConfig),
    searchClaims: async (store, filter) =>
      searchMercadoLivreClaims(mercadoLivreConfig, store, filter),
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
    new Worker(QUEUE_NAMES.marketplaceClaimSweep, async () => processClaimSweep(), {
      connection,
      concurrency: 1,
    }),
  ];
}

/** A store whose last check still waits or runs is left to it: runs never stack up. */
async function enqueueOrderCheck(
  queue: Queue,
  job: OrderCheckJob,
  delayInMs: number,
): Promise<void> {
  const jobId = orderCheckJobId(job);
  const released = await releaseFinishedJob(queue, jobId);
  if (!released) {
    return;
  }
  await queue.add("check-store", job, { ...ORDER_CHECK_JOB_OPTIONS, jobId, delay: delayInMs });
}

function parseOrderCheckJob(data: unknown): OrderCheckJob {
  const parsed = orderCheckJobSchema.safeParse(data);
  if (!parsed.success) {
    throw new UnrecoverableError("Payload do job de conferência de pedidos inválido");
  }
  return parsed.data;
}

/** Every 15 minutes, each store's recent sales compared with SellBridge's (lost notifications). */
function orderCheckWorkers(context: WorkerContext): Worker[] {
  const { database, connectors, cipher, queues, connection } = context;
  const dispatch = createOrderCheckDispatcher({
    database,
    connectors,
    marketplaces: ORDER_CHECK_MARKETPLACES,
    enqueue: async (job, delayInMs) => enqueueOrderCheck(queues.orderCheck, job, delayInMs),
  });
  const dependencies = {
    database,
    connectors,
    cipher,
    acquireRateLimit: context.acquireRateLimit,
    requestStockSync: async () => requestStockSync(context),
    requestAutoForward: async (orderId: string) => requestAutoForward(context, orderId),
  };
  return [
    new Worker(
      QUEUE_NAMES.orderCheck,
      async (job) =>
        job.name === ORDER_CHECK_DISPATCH_JOB
          ? dispatch()
          : checkStoreOrders(dependencies, parseOrderCheckJob(job.data)),
      { connection, concurrency: 2 },
    ),
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

function paymentWorkers(context: WorkerContext): Worker[] {
  const { database, cipher, connection } = context;
  const processPayments = createSupplierPaymentProcessor({
    database,
    cipher,
    settings: mercadoPagoSettingsFrom(environment),
    requestStockSync: async () => requestStockSync(context),
  });
  const processAsaasPayments = createAsaasPaymentProcessor({
    database,
    cipher,
    settings: asaasSettingsFrom(environment),
  });
  const processBoth = async () => runPaymentRounds([processPayments, processAsaasPayments]);
  return [
    new Worker(QUEUE_NAMES.supplierPayments, processBoth, {
      connection,
      concurrency: 1,
    }),
  ];
}

function accountAddressConfig(context: WorkerContext): MercadoLivreConfig {
  const fetchImplementation = context.accountAddressFetch;
  if (fetchImplementation === undefined) {
    return context.mercadoLivreConfig;
  }
  return { ...context.mercadoLivreConfig, fetchImplementation, retry: { retries: 0 } };
}

/** The daily check that a Mercado Livre store does not buy at its supplier's address. */
function storeAccountWorkers(context: WorkerContext): Worker[] {
  const processChecks = createBuyerAddressCheckProcessor({
    database: context.database,
    cipher: context.cipher,
    acquireRateLimit: context.acquireRateLimit,
    readAddresses: async (store) =>
      readMercadoLivreAccountAddresses(accountAddressConfig(context), store),
  });
  return [
    new Worker(QUEUE_NAMES.buyerAddressCheck, async () => processChecks(), {
      connection: context.connection,
      concurrency: 1,
    }),
  ];
}

function deliveryWorkers(context: WorkerContext): Worker[] {
  const { database, cipher, sendEmail, connection } = context;
  const processTickets = createTicketAutoCloseProcessor({ database });
  const processReturns = createReturnDeadlinesProcessor({ database });
  const lookUpCnpj = createCnpjLookup({ baseUrl: environment.CNPJ_LOOKUP_URL });
  const processApprovals = createSupplierApprovalProcessor({
    listPending: async (limit) => listPendingSupplierIds(database, limit),
    check: async (supplierId) => runSupplierApprovalCheck(database, supplierId, { lookUpCnpj }),
  });
  const processWebhooks = createWebhookDeliveryProcessor({
    database,
    cipher,
    allowPrivateUrls: environment.WEBHOOK_ALLOW_PRIVATE_URLS,
  });
  const processNotifications = createNotificationDeliveryProcessor({
    database,
    sendEmail,
    appUrl: environment.APP_URL,
    emailAttachments: createInvoiceAttachments({
      database,
      readFile: blingInvoiceFileReader({
        database,
        cipher,
        blingCredentials: blingCredentials(),
        limiter: context.blingLimiter,
        fetchImplementation: fetch,
      }),
    }),
  });
  const processMessages = createOrderMessageFollowUpProcessor({
    loadMessages: async (shipmentId) => orderMessageMoments(database, shipmentId),
    deliver: async (notice) =>
      deliverOrderMessageNotice({ database, sendEmail, appUrl: environment.APP_URL }, notice),
  });
  return [
    new Worker(
      QUEUE_NAMES.ticketAutoClose,
      async (job) => (job.name === RETURN_DEADLINES_JOB_NAME ? processReturns() : processTickets()),
      { connection, concurrency: 1 },
    ),
    new Worker(QUEUE_NAMES.supplierApproval, async () => processApprovals(), {
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
  await scheduleRecurring(queues.ticketClose, RETURN_DEADLINES_JOB_NAME, 15 * 60 * 1000);
  await scheduleRecurring(queues.supplierApproval, "check-pending-suppliers", 15 * 60 * 1000);
  await scheduleRecurring(queues.tokenRefresh, "refresh-expiring-tokens", 10 * 60 * 1000);
  await scheduleRecurring(queues.shipmentTracking, "track-shipments", 30 * 60 * 1000);
  await scheduleRecurring(queues.orderCheck, ORDER_CHECK_DISPATCH_JOB, 15 * 60 * 1000);
  await scheduleRecurring(queues.claimSweep, "sweep-marketplace-claims", 24 * 60 * 60 * 1000);
  await scheduleRecurring(queues.erpInvoices, "issue-erp-invoices", 2 * 60 * 1000);
  // Lost Bling notices are caught within 15 minutes; see docs/decisions for the quota math.
  await scheduleRecurring(queues.erpStock, ERP_STOCK_JOB_NAMES.checkAll, 15 * 60 * 1000);
  // A sale's exit reaches Bling within a minute, before a check could read the old balance.
  await scheduleRecurring(queues.erpStock, ERP_STOCK_JOB_NAMES.postExits, 60 * 1000);
  await scheduleRecurring(queues.supplierPayments, "reconcile-supplier-payments", 5 * 60 * 1000);
  // Hourly, so a day's checks are spread out; each store is due once a day.
  await scheduleRecurring(queues.buyerAddressCheck, "check-buyer-addresses", 60 * 60 * 1000);
}

function observeWorkers(workers: readonly Worker[]): void {
  for (const worker of workers) {
    worker.on("failed", (job, error) => reportJobFailure(worker.name, job, error));
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
export async function startWorker(
  connectors: ConnectorRegistry,
  options: WorkerOptions = {},
): Promise<void> {
  installErrorAlerts({ webhookUrl: environment.ALERT_WEBHOOK_URL, service: "worker" });
  installPortugueseZodMessages();
  const context = createContext(connectors, options);
  installProblemRecorder(context.database, { service: "worker" });
  const workers = [
    ...marketplaceWorkers(context),
    ...orderWorkers(context),
    ...orderCheckWorkers(context),
    ...recoveryWorkers(context),
    ...deliveryWorkers(context),
    ...erpWorkers(context),
    ...paymentWorkers(context),
    ...storeAccountWorkers(context),
  ];
  observeWorkers(workers);
  // Expose health before scheduling: a Redis outage must not leave probes waiting for startup.
  const healthServer = serveHealth(context, workers);
  registerShutdown(context, workers, healthServer);
  await scheduleQueues(context.queues);
  logger.info("worker.started", { queues: workers.map((worker) => worker.name) });
}
