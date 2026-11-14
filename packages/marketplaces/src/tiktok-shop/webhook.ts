import type { StoredOrderEvent, WebhookRequest, WebhookVerification } from "../types.ts";
import type { TikTokShopConfig } from "./client.ts";
import { orderStatusEventSchema, webhookSchema } from "./schemas.ts";
import { isValidWebhookSignature } from "./signing.ts";

/** Topic name stored for "Order status change" (payload `type: 1`). */
export const ORDER_STATUS_TOPIC = "ORDER_STATUS_CHANGE";

/** Numeric `type` of the delivered payload → the topic names of the Events API. */
const TOPICS_BY_TYPE: Readonly<Record<number, string>> = { 1: ORDER_STATUS_TOPIC };

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Checks the `Authorization` signature over the raw body before reading anything from it, then
 * keeps only the documented fields. The order itself is always fetched again with the store
 * token: the payload is never trusted for data.
 */
export function verifyWebhook(
  config: TikTokShopConfig,
  request: WebhookRequest,
): WebhookVerification {
  const payload = parseJson(request.rawBody);
  const appKey = config.appKey ?? "";
  const appSecret = config.appSecret ?? "";
  if (appKey === "" || appSecret === "") {
    return { valid: false, reason: "Integração com o TikTok Shop não configurada", payload };
  }
  const signed = isValidWebhookSignature({
    appKey,
    appSecret,
    rawBody: request.rawBody,
    signature: request.headers.get("authorization"),
  });
  if (!signed) {
    return { valid: false, reason: "Assinatura do TikTok Shop inválida", payload };
  }
  const parsed = webhookSchema.safeParse(payload);
  if (!parsed.success) {
    return { valid: false, reason: "Notificação fora do formato documentado", payload };
  }
  const order = orderStatusEventSchema.safeParse(payload);
  return {
    valid: true,
    event: {
      externalEventId: parsed.data.tts_notification_id,
      topic: TOPICS_BY_TYPE[parsed.data.type] ?? `type_${parsed.data.type}`,
      externalShopId: parsed.data.shop_id,
      resource: order.success ? order.data.data.order_id : null,
      payload: order.success ? order.data : parsed.data,
    },
  };
}

export function parseStoredOrderEvent(topic: string, rawPayload: unknown): StoredOrderEvent | null {
  if (topic !== ORDER_STATUS_TOPIC) {
    return null;
  }
  const parsed = orderStatusEventSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return { kind: "incomplete" };
  }
  return {
    kind: "order",
    externalShopId: parsed.data.shop_id,
    resource: parsed.data.data.order_id,
  };
}
