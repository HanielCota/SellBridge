import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "t".repeat(40);
const mocks = vi.hoisted(() => ({
  enabled: { value: true },
  subscription: vi.fn<(...input: unknown[]) => Promise<void>>(),
  upgrade: vi.fn<(...input: unknown[]) => Promise<void>>(),
}));
vi.mock("@/lib/server/environment", () => ({
  environment: {
    ASAAS_API_URL: "https://api-sandbox.asaas.com/v3",
    ASAAS_API_KEY: "test-key",
    ASAAS_WALLET_ID: "wallet",
    ASAAS_WEBHOOK_TOKEN: "t".repeat(40),
  },
}));
vi.mock("./billing-config.server", () => ({ billingEnabled: () => mocks.enabled.value }));
vi.mock("./billing-sync.server", () => ({
  syncBillingSubscription: mocks.subscription,
  syncUpgradeCharge: mocks.upgrade,
}));

import { handleBillingWebhook } from "./billing-webhook.server";

function notice(body: unknown, token: string | null = TOKEN): Request {
  return new Request("https://sellbridge.test/api/webhooks/asaas-assinatura", {
    method: "POST",
    headers: token === null ? {} : { "asaas-access-token": token },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.value = true;
  mocks.subscription.mockResolvedValue();
  mocks.upgrade.mockResolvedValue();
});

describe("plans billing webhook", () => {
  it("refuses a notice without SellBridge's token", async () => {
    const response = await handleBillingWebhook(
      notice({ id: "evt_1", event: "PAYMENT_RECEIVED" }, "x"),
    );

    expect(response.status).toBe(401);
    expect(mocks.subscription).not.toHaveBeenCalled();
  });

  it("answers 404 while the plans are not charged", async () => {
    mocks.enabled.value = false;

    const response = await handleBillingWebhook(notice({ id: "evt_1", event: "PAYMENT_RECEIVED" }));

    expect(response.status).toBe(404);
  });

  it("reads back the subscription of a paid monthly charge", async () => {
    const response = await handleBillingWebhook(
      notice({
        id: "evt_2",
        event: "PAYMENT_RECEIVED",
        payment: { id: "pay_1", subscription: "sub_1" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.subscription).toHaveBeenCalledWith({ subscriptionId: "sub_1", eventId: "evt_2" });
  });

  it("reads back a subscription created by a card checkout", async () => {
    await handleBillingWebhook(
      notice({ id: "evt_3", event: "SUBSCRIPTION_CREATED", subscription: { id: "sub_2" } }),
    );

    expect(mocks.subscription).toHaveBeenCalledWith({ subscriptionId: "sub_2", eventId: "evt_3" });
  });

  it("sends an upgrade difference to the upgrade, not to a subscription", async () => {
    await handleBillingWebhook(
      notice({
        id: "evt_4",
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_diff", externalReference: "upgrade:tenant-a" },
      }),
    );

    expect(mocks.upgrade).toHaveBeenCalledWith({ chargeId: "pay_diff", eventId: "evt_4" });
    expect(mocks.subscription).not.toHaveBeenCalled();
  });

  it("requests redelivery when the subscription cannot be read back", async () => {
    mocks.subscription.mockRejectedValue(new Error("Asaas fora do ar"));

    const response = await handleBillingWebhook(
      notice({
        id: "evt_5",
        event: "PAYMENT_OVERDUE",
        payment: { id: "pay_1", subscription: "sub_1" },
      }),
    );

    expect(response.status).toBe(503);
  });
});
