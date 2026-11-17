import type { StoredOrderEvent, WebhookRequest, WebhookVerification } from "../types.ts";
import { parseMercadoLivreJson } from "./json.ts";
import type { MercadoLivreConfig } from "./client.ts";
import { notificationSchema, storedOrderNotificationSchema } from "./schemas.ts";

/**
 * Notification topics that carry sales (`resource: "/orders/{id}"`). "orders_v2" is the
 * current one; legacy "orders" events were accepted before the connector split, so events
 * already stored with it still get processed.
 */
const ORDER_TOPICS: ReadonlySet<string> = new Set(["orders_v2", "orders"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Topics with sub-topics (post_purchase, messages) name the notification `id` instead of `_id`
 * (docs "Notificações", 03/11/2026). Both name the same thing: the event's unique id.
 */
function withEventId(payload: unknown): unknown {
  if (!isRecord(payload) || payload["_id"] !== undefined) {
    return payload;
  }
  return { ...payload, _id: payload["id"] };
}

export function verifyWebhook(
  config: MercadoLivreConfig,
  request: WebhookRequest,
): WebhookVerification {
  const payload = parseMercadoLivreJson(request.rawBody);
  const parsed = notificationSchema.safeParse(withEventId(payload));
  if (!parsed.success) {
    return { valid: false, reason: "Notificação fora do formato documentado", payload };
  }
  // Mercado Livre does not sign notifications: accept only our application id and
  // always re-fetch the resource with the store token (the payload is never trusted).
  if (!config.clientId || String(parsed.data.application_id) !== config.clientId) {
    return { valid: false, reason: "application_id não corresponde ao aplicativo", payload };
  }
  return {
    valid: true,
    event: {
      externalEventId: parsed.data["_id"],
      topic: parsed.data.topic,
      externalShopId: String(parsed.data.user_id),
      resource: parsed.data.resource,
      // The documented fields only, never the raw body: unknown keys are dropped by the schema.
      payload: parsed.data,
    },
  };
}

export function parseStoredOrderEvent(topic: string, rawPayload: unknown): StoredOrderEvent | null {
  if (!ORDER_TOPICS.has(topic)) {
    return null;
  }
  const parsed = storedOrderNotificationSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return { kind: "incomplete" };
  }
  return {
    kind: "order",
    externalShopId: String(parsed.data.user_id),
    resource: parsed.data.resource,
  };
}
