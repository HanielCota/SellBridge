import {
  findConnectedStoreByShop,
  findStoreAwaitingReconnection,
  getWebhookEvent,
  markWebhookFailed,
  markWebhookProcessed,
  recordStoreWebhook,
} from "@sellbridge/database/repositories";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  type StoreOrderCatchUpJob,
  storeOrderCatchUpJobSchema,
  webhookEventJobSchema,
} from "@sellbridge/shared/queues";
import {
  type ConnectorRegistry,
  isFinalMarketplaceAnswer,
  type MarketplaceId,
} from "@sellbridge/marketplaces";
import { UnrecoverableError } from "bullmq";
import type { JobContext } from "../lib/job-context.ts";
import { decryptStoreCredentials, storeRateKey } from "../lib/store-access.ts";
import { type OrderIntakeDependencies, saveMarketplaceOrder } from "./order-intake.ts";
import {
  type NoticeOutcome,
  type NoticeReaders,
  processMarketplaceNotice,
} from "./marketplace-notice.ts";
import { catchUpStoreOrders, heldEventNote } from "./store-order-catch-up.ts";

export interface WebhookDependencies extends OrderIntakeDependencies {
  connectors: ConnectorRegistry;
  /** The per-store quota the other store jobs spend too (`storeRateKey`). */
  acquireRateLimit: (key: string) => Promise<void>;
  /** Schedules the next round of a reconnection catch-up that stopped at a limit. */
  requestCatchUp: (job: StoreOrderCatchUpJob) => Promise<void>;
  /** Reads shipment and claim notifications; without it those topics are skipped. */
  notices?: NoticeReaders;
}

export type WebhookOutcome =
  | "order_created"
  | "order_updated"
  | "already_processed"
  | "ignored_topic"
  | "unknown_store"
  | "awaiting_reconnection"
  | "orders_caught_up"
  | NoticeOutcome;

type WebhookEvent = NonNullable<Awaited<ReturnType<typeof getWebhookEvent>>>;
type ConnectedStore = NonNullable<Awaited<ReturnType<typeof findConnectedStoreByShop>>>;

interface OrderSync {
  readonly dependencies: WebhookDependencies;
  readonly webhookEventId: string;
  readonly marketplace: MarketplaceId;
  readonly store: ConnectedStore;
  readonly accessTokenEnc: string;
  readonly resource: string;
}

interface SkippedEvent {
  readonly kind: "skipped";
  readonly outcome: WebhookOutcome;
}

type SyncPreparation = { readonly kind: "ready"; readonly sync: OrderSync } | SkippedEvent;

type StoreResolution =
  | { readonly kind: "ready"; readonly store: ConnectedStore; readonly accessTokenEnc: string }
  | SkippedEvent;

function parseWebhookJob(job: JobContext): string {
  const parsed = webhookEventJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new UnrecoverableError("Payload do job de webhook inválido");
  }
  return parsed.data.webhookEventId;
}

async function loadWebhookEvent(
  dependencies: WebhookDependencies,
  webhookEventId: string,
): Promise<WebhookEvent> {
  const event = await getWebhookEvent(dependencies.database, webhookEventId);
  if (!event) {
    throw new UnrecoverableError(`Evento ${webhookEventId} não encontrado`);
  }
  return event;
}

async function skipEvent(
  dependencies: WebhookDependencies,
  skipped: { eventId: string; note: string; outcome: WebhookOutcome },
): Promise<SkippedEvent> {
  await markWebhookProcessed(dependencies.database, skipped.eventId, skipped.note);
  return { kind: "skipped", outcome: skipped.outcome };
}

/**
 * Store health on /lojas: when the marketplace last sent an order event about the shop. Only a
 * display, so a failed write is logged and never holds the order back.
 */
async function stampStoreWebhook(
  dependencies: WebhookDependencies,
  storeConnectionId: string,
  receivedAt: Date,
): Promise<void> {
  try {
    await recordStoreWebhook(dependencies.database, { storeConnectionId, receivedAt });
  } catch (error) {
    logger.warn("store.webhook_stamp_failed", { storeConnectionId, error });
  }
}

/**
 * No usable store for the event. A store that lost its access (expired, refused token) reads its
 * sales from the marketplace once the reseller reconnects it, and checks these events again once
 * (store-order-catch-up.ts), so the event is closed with the reason, naming the store, right
 * away. Kept open, anyone who knows the app's public id could pile up events that were retried
 * every 5 minutes and never deleted. A shop we never knew is skipped for good.
 */
async function holdOrSkip(
  dependencies: WebhookDependencies,
  event: WebhookEvent,
  shopId: string,
): Promise<SkippedEvent> {
  const eventId = event.id;
  const awaiting = await findStoreAwaitingReconnection(
    dependencies.database,
    event.marketplace,
    shopId,
  );
  if (awaiting) {
    // The marketplace still talks about the shop while it waits on a reconnection.
    await stampStoreWebhook(dependencies, awaiting.id, event.receivedAt);
    const note = heldEventNote(awaiting.id);
    return skipEvent(dependencies, { eventId, note, outcome: "awaiting_reconnection" });
  }
  const note = "Nenhuma loja conectada corresponde ao evento";
  return skipEvent(dependencies, { eventId, note, outcome: "unknown_store" });
}

/** The connected store an event names, with its token; unusable events are marked as processed. */
async function resolveEventStore(
  dependencies: WebhookDependencies,
  event: WebhookEvent,
  externalShopId: string,
): Promise<StoreResolution> {
  const store = await findConnectedStoreByShop(
    dependencies.database,
    event.marketplace,
    externalShopId,
  );
  if (!store) {
    return holdOrSkip(dependencies, event, externalShopId);
  }
  await stampStoreWebhook(dependencies, store.id, event.receivedAt);
  if (!store.accessTokenEnc) {
    const note = "Loja sem token de acesso: reconecte a loja";
    return skipEvent(dependencies, { eventId: event.id, note, outcome: "unknown_store" });
  }
  return { kind: "ready", store, accessTokenEnc: store.accessTokenEnc };
}

/** A shipment or claim notification, read again with the store's token. */
async function processNotice(
  dependencies: WebhookDependencies & { notices: NoticeReaders },
  job: JobContext,
  event: WebhookEvent,
): Promise<WebhookOutcome | null> {
  const notice = dependencies.notices.parseNotice(event.marketplace, event.topic, event.rawPayload);
  if (notice === null) {
    return null;
  }
  // Questions off: the event is closed as an ignored topic, like any other it does not read.
  if (notice.kind === "question" && dependencies.notices.readQuestion === undefined) {
    return null;
  }
  const resolution = await resolveEventStore(dependencies, event, notice.externalShopId);
  if (resolution.kind === "skipped") {
    return resolution.outcome;
  }
  return processMarketplaceNotice(
    {
      database: dependencies.database,
      cipher: dependencies.cipher,
      acquireRateLimit: dependencies.acquireRateLimit,
      requestStockSync: dependencies.requestStockSync,
      readers: dependencies.notices,
    },
    {
      job,
      notice,
      event: {
        webhookEventId: event.id,
        receivedAt: event.receivedAt,
        marketplace: event.marketplace,
        store: resolution.store,
        accessTokenEnc: resolution.accessTokenEnc,
      },
    },
  );
}

/** Resolves the store and resource of an order event, marking unusable events as processed. */
async function prepareOrderSync(
  dependencies: WebhookDependencies,
  webhookEventId: string,
  event: WebhookEvent,
): Promise<SyncPreparation> {
  const eventId = event.id;
  const marketplace = event.marketplace;
  const reference = dependencies.connectors[marketplace].parseStoredOrderEvent(
    event.topic,
    event.rawPayload,
  );
  if (!reference) {
    const note = `Tópico ${event.topic} ignorado`;
    return skipEvent(dependencies, { eventId, note, outcome: "ignored_topic" });
  }
  if (reference.kind === "incomplete") {
    const note = "Evento sem loja ou recurso";
    return skipEvent(dependencies, { eventId, note, outcome: "unknown_store" });
  }
  const resolution = await resolveEventStore(dependencies, event, reference.externalShopId);
  if (resolution.kind === "skipped") {
    return resolution;
  }
  return {
    kind: "ready",
    sync: {
      dependencies,
      webhookEventId,
      marketplace,
      store: resolution.store,
      accessTokenEnc: resolution.accessTokenEnc,
      resource: reference.resource,
    },
  };
}

async function syncOrder(sync: OrderSync): Promise<WebhookOutcome> {
  const { dependencies, store } = sync;
  // Decrypted here, inside the caller's try, so a bad token is recorded on the event.
  const credentials = decryptStoreCredentials(dependencies.cipher, {
    externalShopId: store.externalShopId,
    accessTokenEnc: sync.accessTokenEnc,
  });
  // Notifications are unsigned: a flood of made-up ones must not spend the store's quota faster
  // than publishing or stock sync may.
  await dependencies.acquireRateLimit(
    storeRateKey({ marketplace: sync.marketplace, id: store.id }),
  );
  const order = await dependencies.connectors[sync.marketplace].fetchOrder(
    credentials,
    sync.resource,
  );
  const { status } = await saveMarketplaceOrder(dependencies, store, order, {
    webhookEventId: sync.webhookEventId,
  });
  await markWebhookProcessed(dependencies.database, sync.webhookEventId);
  logger.info("webhook.order_synced", {
    webhookEventId: sync.webhookEventId,
    tenantId: store.tenantId,
    externalOrderId: order.externalOrderId,
    result: status,
  });
  return status === "created" ? "order_created" : "order_updated";
}

async function handleSyncFailure(sync: OrderSync, job: JobContext, error: unknown): Promise<never> {
  const message = userMessageOr(error, "Falha ao processar o evento");
  if (isFinalMarketplaceAnswer(error)) {
    await markWebhookProcessed(sync.dependencies.database, sync.webhookEventId, message);
    logger.error("webhook.rejected_by_marketplace_answer", {
      webhookEventId: sync.webhookEventId,
      error,
    });
    throw new UnrecoverableError(message);
  }
  const isFinal = job.attemptsMade + 1 >= job.maxAttempts;
  await markWebhookFailed(sync.dependencies.database, sync.webhookEventId, message);
  logger.warn("webhook.processing_failed", { webhookEventId: sync.webhookEventId, isFinal, error });
  throw error;
}

export function createWebhookEventProcessor(dependencies: WebhookDependencies) {
  return async function processWebhookEvent(job: JobContext): Promise<WebhookOutcome> {
    const catchUp = storeOrderCatchUpJobSchema.safeParse(job.data);
    if (catchUp.success) {
      return catchUpStoreOrders(dependencies, catchUp.data);
    }
    const webhookEventId = parseWebhookJob(job);
    const event = await loadWebhookEvent(dependencies, webhookEventId);
    if (event.processedAt) {
      return "already_processed";
    }
    const { notices } = dependencies;
    if (notices !== undefined) {
      const noticeOutcome = await processNotice({ ...dependencies, notices }, job, event);
      if (noticeOutcome !== null) {
        return noticeOutcome;
      }
    }
    const preparation = await prepareOrderSync(dependencies, webhookEventId, event);
    if (preparation.kind === "skipped") {
      return preparation.outcome;
    }
    try {
      return await syncOrder(preparation.sync);
    } catch (error) {
      return handleSyncFailure(preparation.sync, job, error);
    }
  };
}
