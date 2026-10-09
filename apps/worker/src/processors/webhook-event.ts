import type { Database } from "@sellbridge/database";
import {
  findConnectedStoreByShop,
  getWebhookEvent,
  markWebhookFailed,
  markWebhookProcessed,
  upsertMarketplaceOrder,
} from "@sellbridge/database/repositories";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { webhookEventJobSchema } from "@sellbridge/shared/queues";
import type { ConnectorRegistry, MarketplaceId, TokenCipher } from "@sellbridge/marketplaces";
import { UnrecoverableError } from "bullmq";
import { z } from "zod";

export interface WebhookDependencies {
  database: Database;
  connectors: ConnectorRegistry;
  cipher: TokenCipher;
}

export interface WebhookJobContext {
  data: unknown;
  attemptsMade: number;
  maxAttempts: number;
}

export type WebhookOutcome =
  "order_created" | "order_updated" | "already_processed" | "ignored_topic" | "unknown_store";

/** Topics that carry orders: "orders_v2" (Mercado Livre) and "orders" (simulated marketplace). */
const ORDER_TOPICS = new Set(["orders", "orders_v2"]);

const storedEventSchema = z.object({
  shopId: z.union([z.string(), z.number()]).optional(),
  user_id: z.union([z.string(), z.number()]).optional(),
  resource: z.string().min(1),
});

function shopAndResource(rawPayload: unknown): { shopId: string; resource: string } | null {
  const parsed = storedEventSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return null;
  }
  const shopId = parsed.data.shopId ?? parsed.data.user_id;
  if (shopId === undefined) {
    return null;
  }
  return { shopId: String(shopId), resource: parsed.data.resource };
}

export function createWebhookEventProcessor(dependencies: WebhookDependencies) {
  return async function processWebhookEvent(job: WebhookJobContext): Promise<WebhookOutcome> {
    const parsed = webhookEventJobSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new UnrecoverableError("Payload do job de webhook inválido");
    }
    const { webhookEventId } = parsed.data;
    const event = await getWebhookEvent(dependencies.database, webhookEventId);
    if (!event) {
      throw new UnrecoverableError(`Evento ${webhookEventId} não encontrado`);
    }
    if (event.processedAt) {
      return "already_processed";
    }
    if (!ORDER_TOPICS.has(event.topic)) {
      await markWebhookProcessed(dependencies.database, event.id, `Tópico ${event.topic} ignorado`);
      return "ignored_topic";
    }
    const reference = shopAndResource(event.rawPayload);
    if (!reference) {
      await markWebhookProcessed(dependencies.database, event.id, "Evento sem loja ou recurso");
      return "unknown_store";
    }
    const marketplace: MarketplaceId = event.marketplace;
    const store = await findConnectedStoreByShop(
      dependencies.database,
      marketplace,
      reference.shopId,
    );
    if (!store) {
      await markWebhookProcessed(
        dependencies.database,
        event.id,
        "Nenhuma loja conectada corresponde ao evento",
      );
      return "unknown_store";
    }
    if (!store.accessTokenEnc) {
      await markWebhookProcessed(
        dependencies.database,
        event.id,
        "Loja sem token de acesso: reconecte a loja",
      );
      return "unknown_store";
    }

    try {
      const order = await dependencies.connectors[marketplace].fetchOrder(
        {
          externalShopId: store.externalShopId,
          accessToken: dependencies.cipher.decrypt(store.accessTokenEnc),
        },
        reference.resource,
      );
      const result = await upsertMarketplaceOrder(
        dependencies.database,
        store.tenantId,
        store.id,
        order,
      );
      await markWebhookProcessed(dependencies.database, event.id);
      logger.info("webhook.order_synced", {
        webhookEventId,
        tenantId: store.tenantId,
        externalOrderId: order.externalOrderId,
        result: result.status,
      });
      return result.status === "created" ? "order_created" : "order_updated";
    } catch (error) {
      const message = isAppError(error) ? error.userMessage : "Falha ao processar o evento";
      const isFinal = job.attemptsMade + 1 >= job.maxAttempts;
      await markWebhookFailed(dependencies.database, event.id, message);
      logger.warn("webhook.processing_failed", { webhookEventId, isFinal, error });
      throw error;
    }
  };
}
