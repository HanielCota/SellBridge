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

/** A shipment, claim or question notification: only a prompt to read the resource again. */
export type MercadoLivreNotice =
  | { kind: "shipment"; externalShopId: string; shipmentId: string }
  | { kind: "claim"; externalShopId: string; claimId: string }
  | { kind: "question"; externalShopId: string; questionId: string };

/** `/shipments/{id}`, with or without the leading slash or a trailing sub-resource. */
const SHIPMENT_RESOURCE = /^\/?shipments\/(\d{1,20})(?:\/.*)?$/;
/**
 * `/post-purchase/v1/claims/{id}`. The docs warn the `/post-purchase` prefix is new and show the
 * resource without the leading slash, so the older `/claims/{id}` is read too.
 */
const CLAIM_RESOURCE = /^\/?(?:post-purchase\/v1\/)?claims\/(\d{1,20})(?:\/.*)?$/;
/** `/questions/{id}` ("Notificações", topic `questions`). */
const QUESTION_RESOURCE = /^\/?questions\/(\d{1,20})(?:\/.*)?$/;
const NOTICE_TOPICS: ReadonlySet<string> = new Set(["shipments", "post_purchase", "questions"]);

function resourceId(pattern: RegExp, resource: string): string | null {
  return pattern.exec(resource)?.[1] ?? null;
}

/**
 * Reads a stored `shipments`, `post_purchase` or `questions` notification. Null for any other
 * topic and for a resource that does not name a shipment, claim or question.
 */
export function parseMercadoLivreNotice(
  topic: string,
  rawPayload: unknown,
): MercadoLivreNotice | null {
  if (!NOTICE_TOPICS.has(topic)) {
    return null;
  }
  const parsed = storedOrderNotificationSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return null;
  }
  const externalShopId = String(parsed.data.user_id);
  if (topic === "shipments") {
    const shipmentId = resourceId(SHIPMENT_RESOURCE, parsed.data.resource);
    return shipmentId === null ? null : { kind: "shipment", externalShopId, shipmentId };
  }
  if (topic === "questions") {
    const questionId = resourceId(QUESTION_RESOURCE, parsed.data.resource);
    return questionId === null ? null : { kind: "question", externalShopId, questionId };
  }
  const claimId = resourceId(CLAIM_RESOURCE, parsed.data.resource);
  return claimId === null ? null : { kind: "claim", externalShopId, claimId };
}
