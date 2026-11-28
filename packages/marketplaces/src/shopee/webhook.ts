import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import type { StoredOrderEvent, WebhookRequest, WebhookVerification } from "../types.ts";
import { isShopeeConfigured, type ShopeeConfig } from "./client.ts";

export const SHOPEE_ORDER_TOPIC = "order_status";
export const SHOPEE_IGNORED_TOPIC = "other";
const ORDER_STATUS_CODE = 3;
const orderNoticeSchema = z.object({
  code: z.literal(ORDER_STATUS_CODE),
  shop_id: z.number().int().positive(),
  timestamp: z.number().int().optional(),
  data: z.object({
    ordersn: z.string().regex(/^[A-Z0-9]{1,40}$/i),
    status: z.string().min(1).max(60),
    update_time: z.number().int().optional(),
  }),
});

function verifies(config: ShopeeConfig, request: WebhookRequest) {
  const signature = request.headers.get("authorization");
  if (
    !isShopeeConfigured(config) ||
    config.webhookUrl === undefined ||
    config.partnerKey === undefined ||
    signature === null ||
    !/^[a-f\d]{64}$/i.test(signature)
  ) {
    return false;
  }

  const expected = createHmac("sha256", config.partnerKey.trim())
    .update(`${config.webhookUrl}|${request.rawBody}`, "utf8")
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function parseStoredOrderEvent(topic: string, payload: unknown): StoredOrderEvent | null {
  if (topic !== SHOPEE_ORDER_TOPIC) {
    return null;
  }

  const notice = orderNoticeSchema.safeParse(payload);
  if (!notice.success) {
    return { kind: "incomplete" };
  }

  return {
    kind: "order",
    externalShopId: String(notice.data.shop_id),
    resource: notice.data.data.ordersn,
  };
}

function parsedBody(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return undefined;
  }
}

/**
 * A signed push SellBridge does not use. A push Shopee signed but sent in a shape this code does
 * not read is acknowledged too: refusing it would only make Shopee send it again and again.
 */
function ignoredPush(rawBody: string): WebhookVerification {
  return {
    valid: true,
    event: {
      externalEventId: createHash("sha256").update(rawBody).digest("hex"),
      topic: SHOPEE_IGNORED_TOPIC,
      externalShopId: null,
      resource: null,
      payload: null,
    },
  };
}

export function verifyWebhook(config: ShopeeConfig, request: WebhookRequest): WebhookVerification {
  if (!verifies(config, request)) {
    return { valid: false, reason: "Assinatura da Shopee inválida", payload: null };
  }

  const payload = parsedBody(request.rawBody);
  const notice = orderNoticeSchema.safeParse(payload);
  if (!notice.success) {
    const code =
      typeof payload === "object" && payload !== null ? Reflect.get(payload, "code") : null;
    if (code === ORDER_STATUS_CODE || payload === undefined) {
      logger.warn("shopee.push_unreadable", { code: typeof code === "number" ? code : null });
    }
    return ignoredPush(request.rawBody);
  }

  const { shop_id: shopId, timestamp, data } = notice.data;
  const key = [shopId, data.ordersn, data.status, data.update_time ?? timestamp ?? request.rawBody];
  return {
    valid: true,
    event: {
      externalEventId: createHash("sha256").update(JSON.stringify(key)).digest("hex"),
      topic: SHOPEE_ORDER_TOPIC,
      externalShopId: String(shopId),
      resource: data.ordersn,
      payload: notice.data,
    },
  };
}
