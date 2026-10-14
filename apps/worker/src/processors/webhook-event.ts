import type { Database } from "@sellbridge/database";
import {
  findConnectedStoreByShop,
  getWebhookEvent,
  markWebhookFailed,
  markWebhookProcessed,
  upsertMarketplaceOrder,
} from "@sellbridge/database/repositories";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { webhookEventJobSchema } from "@sellbridge/shared/queues";
import {
  type ConnectorRegistry,
  isMarketplaceAuthError,
  isMarketplaceError,
  isRetryableError,
  type MarketplaceId,
} from "@sellbridge/marketplaces";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { UnrecoverableError } from "bullmq";
import type { JobContext } from "../lib/job-context.ts";
import { decryptStoreCredentials } from "../lib/store-access.ts";

export interface WebhookDependencies {
  database: Database;
  connectors: ConnectorRegistry;
  cipher: TokenCipher;
  /** Asks the stock and price sync to run now instead of at its next scheduled run. */
  requestStockSync: () => Promise<void>;
}

export type WebhookOutcome =
  "order_created" | "order_updated" | "already_processed" | "ignored_topic" | "unknown_store";

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
    const note = "Nenhuma loja conectada corresponde ao evento";
    return skipEvent(dependencies, { eventId, note, outcome: "unknown_store" });
  }
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

/**
 * The order is saved either way: when Redis is down, the scheduled sync sends the new count a
 * few minutes later, so a failed request is logged, not thrown.
 */
async function requestStockSyncSafely(
  dependencies: WebhookDependencies,
  webhookEventId: string,
): Promise<void> {
  try {
    await dependencies.requestStockSync();
  } catch (error) {
    logger.warn("stock.sync_deferred", { webhookEventId, error });
  }
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
  const result = await upsertMarketplaceOrder(
    dependencies.database,
    store.tenantId,
    store.id,
    order,
  );
  await markWebhookProcessed(dependencies.database, sync.webhookEventId);
  if (result.stockMoves > 0) {
    await requestStockSyncSafely(dependencies, sync.webhookEventId);
  }
  logger.info("webhook.order_synced", {
    webhookEventId: sync.webhookEventId,
    tenantId: store.tenantId,
    externalOrderId: order.externalOrderId,
    result: result.status,
  });
  return result.status === "created" ? "order_created" : "order_updated";
}

/**
 * The marketplace answered for good (an order outside what we can store, a resource that no
 * longer exists): retrying, now or from the sweeper, gets the same answer. Auth failures are
 * left to retry, so reconnecting the store still brings the order in.
 */
function isFinalMarketplaceAnswer(error: unknown): boolean {
  return isMarketplaceError(error) && !isRetryableError(error) && !isMarketplaceAuthError(error);
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
