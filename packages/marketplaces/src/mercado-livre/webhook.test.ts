import { describe, expect, it } from "vitest";
import { verifyWebhook } from "./webhook.ts";

const config = { clientId: "89745685555", clientSecret: "secret" };

/** The claims notification as the docs show it ("Notificações", Post Purchase, 03/11/2026). */
const claimNotification = {
  id: "5e2827f2-99b7-474e-b68b-6a86e934cc7e",
  resource: "post-purchase/v1/claims/5108684499",
  user_id: 123456789,
  topic: "post_purchase",
  actions: ["claims"],
  application_id: 89745685555,
  attempts: 1,
  sent: "2017-10-09T13:44:33.006Z",
  received: "2017-10-09T13:44:32.984Z",
};

function verify(body: unknown) {
  return verifyWebhook(config, { headers: new Headers(), rawBody: JSON.stringify(body) });
}

describe("verifyWebhook", () => {
  // Regression: topics with sub-topics name the event `id`, not `_id`; the claims notification
  // was answered 401, so Mercado Livre would retry it for an hour and could turn the topic off.
  it("accepts a sub-topic notification that names its event id `id`", () => {
    const result = verify(claimNotification);

    expect(result).toMatchObject({
      valid: true,
      event: {
        externalEventId: "5e2827f2-99b7-474e-b68b-6a86e934cc7e",
        topic: "post_purchase",
        externalShopId: "123456789",
        resource: "post-purchase/v1/claims/5108684499",
      },
    });
  });

  it("keeps `_id` when a notification carries both ids", () => {
    const result = verify({ ...claimNotification, _id: "general-id" });

    expect(result.valid && result.event.externalEventId).toBe("general-id");
  });

  it("refuses a notification without any event id", () => {
    const { id: _ignored, ...withoutId } = claimNotification;

    expect(verify(withoutId).valid).toBe(false);
  });
});
