import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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

export function verifyWebhook(config: ShopeeConfig, request: WebhookRequest): WebhookVerification {
  if (!verifies(config, request)) {
    return { valid: false, reason: "Assinatura da Shopee inválida", payload: null };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(request.rawBody);
  } catch {
    return { valid: false, reason: "Notificação da Shopee inválida", payload: null };
  }

  const notice = orderNoticeSchema.safeParse(payload);
  if (!notice.success) {
    if (
      typeof payload === "object" &&
      payload !== null &&
      Reflect.get(payload, "code") !== ORDER_STATUS_CODE
    ) {
      return {
        valid: true,
        event: {
          externalEventId: createHash("sha256").update(request.rawBody).digest("hex"),
          topic: SHOPEE_IGNORED_TOPIC,
          externalShopId: null,
          resource: null,
          payload: null,
        },
      };
    }

    return { valid: false, reason: "Notificação de pedido da Shopee inválida", payload: null };
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
