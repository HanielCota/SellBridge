import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ORDER_STATUS_TOPIC, parseStoredOrderEvent, verifyWebhook } from "./webhook.ts";

/** The reproducible example of the official webhook guide: app key "abcdef", secret "123". */
const CONFIG = { appKey: "abcdef", appSecret: "123", serviceId: "1" };
const RAW_BODY =
  '{"type":1,"tts_notification_id":"7380066284010030890","shop_id":"7495540735365777507","timestamp":1718305585,"data":{"is_on_hold_order":true,"order_id":"576653688135258178","order_status":"UNPAID","update_time":1718305585}}';
const SIGNATURE = "5dec0f11ec2f6783b8deee53c9ffbf8d024302f7c7e7fa55a35d17629031ac05";

function request(rawBody: string, signature: string | null) {
  const headers = new Headers();
  if (signature !== null) {
    headers.set("authorization", signature);
  }
  return { headers, rawBody };
}

describe("verifyWebhook", () => {
  it("accepts the documented order status change and points at the order", () => {
    const verification = verifyWebhook(CONFIG, request(RAW_BODY, SIGNATURE));

    expect(verification).toMatchObject({
      valid: true,
      event: {
        externalEventId: "7380066284010030890",
        topic: ORDER_STATUS_TOPIC,
        externalShopId: "7495540735365777507",
        resource: "576653688135258178",
      },
    });
  });

  it("refuses a request without the signature header", () => {
    const verification = verifyWebhook(CONFIG, request(RAW_BODY, null));

    expect(verification.valid).toBe(false);
  });

  it("refuses a signature made with another secret", () => {
    const verification = verifyWebhook(
      { ...CONFIG, appSecret: "456" },
      request(RAW_BODY, SIGNATURE),
    );

    expect(verification.valid).toBe(false);
  });

  it("refuses everything while the app is not configured", () => {
    const verification = verifyWebhook(
      { appKey: undefined, appSecret: undefined, serviceId: undefined },
      request(RAW_BODY, SIGNATURE),
    );

    expect(verification).toMatchObject({ valid: false, reason: /não configurada/ });
  });

  it("keeps a signed event of another topic without an order resource", () => {
    const body = RAW_BODY.replace('"type":1', '"type":6');
    const signature = createHmac("sha256", "123").update(`abcdef${body}`).digest("hex");

    const verification = verifyWebhook(CONFIG, request(body, signature));

    expect(verification).toMatchObject({ valid: true, event: { topic: "type_6", resource: null } });
  });
});

describe("parseStoredOrderEvent", () => {
  it("reads the shop and order of a stored order status change", () => {
    const stored = JSON.parse(RAW_BODY);

    const event = parseStoredOrderEvent(ORDER_STATUS_TOPIC, stored);

    expect(event).toEqual({
      kind: "order",
      externalShopId: "7495540735365777507",
      resource: "576653688135258178",
    });
  });

  it("ignores topics that are not about orders", () => {
    expect(parseStoredOrderEvent("type_6", {})).toBeNull();
  });

  it("reports an order event missing its order id as incomplete", () => {
    const event = parseStoredOrderEvent(ORDER_STATUS_TOPIC, { type: 1, shop_id: "1" });

    expect(event).toEqual({ kind: "incomplete" });
  });
});
