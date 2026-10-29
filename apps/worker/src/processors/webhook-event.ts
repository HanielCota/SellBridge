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
import { storeOrderCatchUpJobSchema, webhookEventJobSchema } from "@sellbridge/shared/queues";
import {
  type ConnectorRegistry,
  isFinalMarketplaceAnswer,
  type MarketplaceId,
} from "@sellbridge/marketplaces";
import { UnrecoverableError } from "bullmq";
import type { JobContext } from "../lib/job-context.ts";
import { decryptStoreCredentials } from "../lib/store-access.ts";
import { type OrderIntakeDependencies, saveMarketplaceOrder } from "./order-intake.ts";
import { catchUpStoreOrders, heldEventNote } from "./store-order-catch-up.ts";

export interface WebhookDependencies extends OrderIntakeDependencies {
  connectors: ConnectorRegistry;
}

export type WebhookOutcome =
  | "order_created"
  | "order_updated"
  | "already_processed"
  | "ignored_topic"
  | "unknown_store"
  | "awaiting_reconnection"
  | "orders_caught_up";

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

type SyncPreparation =
  | { readonly kind: "ready"; readonly sync: OrderSync }
  | { readonly kind: "skipped"; readonly outcome: WebhookOutcome };

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
): Promise<SyncPreparation> {
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
): Promise<SyncPreparation> {
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
  const store = await findConnectedStoreByShop(
    dependencies.database,
    marketplace,
    reference.externalShopId,
  );
  if (!store) {
    return holdOrSkip(dependencies, event, reference.externalShopId);
  }
  await stampStoreWebhook(dependencies, store.id, event.receivedAt);
  if (!store.accessTokenEnc) {
    const note = "Loja sem token de acesso: reconecte a loja";
    return skipEvent(dependencies, { eventId, note, outcome: "unknown_store" });
  }
  return {
    kind: "ready",
    sync: {
      dependencies,
      webhookEventId,
      marketplace,
      store,
      accessTokenEnc: store.accessTokenEnc,
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
  const order = await dependencies.connectors[sync.marketplace].fetchOrder(
    credentials,
    sync.resource,
  );
  const status = await saveMarketplaceOrder(dependencies, store, order, {
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
