import { describe, expect, it } from "vitest";
import { isValidWebhookSignature, signRequest } from "./signing.ts";

describe("signRequest", () => {
  it("reproduces the Get Authorized Shops example of the official signing guide", () => {
    const query = new URLSearchParams({ app_key: "29a39d", timestamp: "1623812664" });

    const sign = signRequest({
      path: "/authorization/202309/shops",
      query,
      body: null,
      appSecret: "e59af819cc",
    });

    expect(sign).toBe("b596b73e0cc6de07ac26f036364178ab16b0a907af13d43f0a0cd2345f582dc8");
  });

  it("leaves sign and access_token out of the signed parameters", () => {
    const base = new URLSearchParams({ app_key: "29a39d", timestamp: "1623812664" });
    const withExtras = new URLSearchParams(base);
    withExtras.set("sign", "anything");
    withExtras.set("access_token", "legacy-token");

    const plain = signRequest({ path: "/a", query: base, body: null, appSecret: "s" });
    const extras = signRequest({ path: "/a", query: withExtras, body: null, appSecret: "s" });

    expect(extras).toBe(plain);
  });

  it("sorts the parameters by key, whatever order they were added in", () => {
    const sorted = new URLSearchParams([
      ["app_key", "k"],
      ["shop_cipher", "c"],
      ["timestamp", "1"],
    ]);
    const shuffled = new URLSearchParams([
      ["timestamp", "1"],
      ["app_key", "k"],
      ["shop_cipher", "c"],
    ]);

    expect(signRequest({ path: "/p", query: shuffled, body: "{}", appSecret: "s" })).toBe(
      signRequest({ path: "/p", query: sorted, body: "{}", appSecret: "s" }),
    );
  });

  it("signs the body exactly as sent", () => {
    const query = new URLSearchParams({ app_key: "k", timestamp: "1" });

    const compact = signRequest({ path: "/p", query, body: '{"a":1}', appSecret: "s" });
    const spaced = signRequest({ path: "/p", query, body: '{"a": 1}', appSecret: "s" });

    expect(compact).not.toBe(spaced);
  });
});

describe("isValidWebhookSignature", () => {
  const rawBody =
    '{"type":1,"tts_notification_id":"7380066284010030890","shop_id":"7495540735365777507","timestamp":1718305585,"data":{"is_on_hold_order":true,"order_id":"576653688135258178","order_status":"UNPAID","update_time":1718305585}}';

  it("accepts the reproducible example of the official webhook guide", () => {
    const valid = isValidWebhookSignature({
      appKey: "abcdef",
      appSecret: "123",
      rawBody,
      signature: "5dec0f11ec2f6783b8deee53c9ffbf8d024302f7c7e7fa55a35d17629031ac05",
    });

    expect(valid).toBe(true);
  });

  it("refuses a body changed after signing", () => {
    const valid = isValidWebhookSignature({
      appKey: "abcdef",
      appSecret: "123",
      rawBody: rawBody.replace("UNPAID", "AWAITING_SHIPMENT"),
      signature: "5dec0f11ec2f6783b8deee53c9ffbf8d024302f7c7e7fa55a35d17629031ac05",
    });

    expect(valid).toBe(false);
  });

  it("refuses a missing or blank signature", () => {
    const missing = isValidWebhookSignature({
      appKey: "abcdef",
      appSecret: "123",
      rawBody,
      signature: null,
    });
    const blank = isValidWebhookSignature({
      appKey: "abcdef",
      appSecret: "123",
      rawBody,
      signature: " ",
    });

    expect(missing).toBe(false);
    expect(blank).toBe(false);
  });
});
