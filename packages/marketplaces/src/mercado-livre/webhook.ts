import type { StoredOrderEvent, WebhookRequest, WebhookVerification } from "../types.ts";
import { parseJsonText } from "@sellbridge/shared/http-body";
import type { MercadoLivreConfig } from "./client.ts";
import { notificationSchema, storedOrderNotificationSchema } from "./schemas.ts";

/** Notification topic that carries sales (`resource: "/orders/{id}"`). */
const ORDER_TOPIC = "orders_v2";

export function verifyWebhook(
  config: MercadoLivreConfig,
  request: WebhookRequest,
): WebhookVerification {
  const payload = parseJsonText(request.rawBody);
  const parsed = notificationSchema.safeParse(payload);
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
      payload,
    },
  };
}

export function parseStoredOrderEvent(topic: string, rawPayload: unknown): StoredOrderEvent | null {
  if (topic !== ORDER_TOPIC) {
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
