import { Stripe } from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  apply: vi.fn<(...input: unknown[]) => Promise<void>>(),
  lock: vi.fn<(...input: unknown[]) => Promise<{ subscriptionId: string } | null>>(),
  retrieve: vi.fn<(id: string) => Promise<unknown>>(),
  list: vi.fn<(input: unknown) => Promise<unknown>>(),
  transaction: vi.fn<(operation: (executor: object) => Promise<void>) => Promise<void>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  applyBillingEvent: mocks.apply,
  lockBillingCustomer: mocks.lock,
}));
vi.mock("@/lib/server/database", () => ({ database: { transaction: mocks.transaction } }));
vi.mock("@/lib/server/environment", () => ({
  environment: {
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_PRO_PRICE_ID: "price_pro",
    STRIPE_BUSINESS_PRICE_ID: "price_business",
  },
}));
vi.mock("./stripe.server", () => ({
  billingConfigured: () => true,
  stripeClient: () => ({
    webhooks: new Stripe("sk_test_local").webhooks,
    subscriptions: { retrieve: mocks.retrieve, list: mocks.list },
  }),
}));
import { handleBillingWebhook } from "./webhook.server";
const subscription = {
  id: "sub_test",
  customer: "cus_test",
  status: "active",
  cancel_at_period_end: false,
  items: { data: [{ current_period_end: 1800000000, price: { id: "price_pro" } }] },
};
function request(
  type = "customer.subscription.updated",
  signature = true,
  object: unknown = subscription,
) {
  const payload = JSON.stringify({
    id: "evt_test",
    created: 1791800000,
    type,
    data: { object },
  });
  const header = new Stripe("sk_test_local").webhooks.generateTestHeaderString({
    payload,
    secret: "whsec_test",
  });
  return new Request("https://sellbridge.test/api/webhooks/stripe", {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": signature ? header : "invalid" },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lock.mockResolvedValue({ subscriptionId: "sub_test" });
  mocks.retrieve.mockResolvedValue(subscription);
  mocks.list.mockResolvedValue({ data: [subscription] });
  mocks.transaction.mockImplementation(async (operation) => {
    await operation({});
  });
});
describe("signed billing webhook", () => {
  it("rejects forged signatures before touching database or provider", async () => {
    expect((await handleBillingWebhook(request(undefined, false))).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("persists confirmed state and recognized price from the provider", async () => {
    expect((await handleBillingWebhook(request())).status).toBe(200);
    expect(mocks.apply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ eventId: "evt_test", plan: "pro", status: "active" }),
    );
  });
  it("uses the current subscription for delayed cancellation of an old one", async () => {
    mocks.list.mockResolvedValue({
      data: [
        {
          ...subscription,
          id: "sub_new",
          items: { data: [{ current_period_end: 1800000000, price: { id: "price_business" } }] },
        },
      ],
    });
    await handleBillingWebhook(request("customer.subscription.deleted"));
    expect(mocks.apply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ subscriptionId: "sub_new", plan: "business" }),
    );
  });
  it("restricts paused payment collection", async () => {
    mocks.list.mockResolvedValue({
      data: [{ ...subscription, pause_collection: { behavior: "void" } }],
    });
    await handleBillingWebhook(request());
    expect(mocks.apply).toHaveBeenCalledWith({}, expect.objectContaining({ status: "paused" }));
  });
  it("asks Stripe to retry transient failures", async () => {
    mocks.list.mockRejectedValue(new Error("unavailable"));
    expect((await handleBillingWebhook(request())).status).toBe(500);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("ignores events unrelated to subscriptions", async () => {
    expect((await handleBillingWebhook(request("invoice.created"))).status).toBe(200);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("ignores customers outside this application", async () => {
    mocks.lock.mockResolvedValue(null);
    expect((await handleBillingWebhook(request())).status).toBe(200);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it.each(["invoice.paid", "invoice.payment_failed"])(
    "reconciles subscription state for %s",
    async (type) => {
      await handleBillingWebhook(
        request(type, true, {
          customer: "cus_test",
          parent: { subscription_details: { subscription: "sub_test" } },
        }),
      );
      expect(mocks.apply).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ subscriptionId: "sub_test" }),
      );
    },
  );
  it("does not fulfill an unpaid asynchronous checkout", async () => {
    await handleBillingWebhook(
      request("checkout.session.completed", true, {
        customer: "cus_test",
        subscription: "sub_test",
        payment_status: "unpaid",
      }),
    );
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("reconciles a confirmed asynchronous checkout payment", async () => {
    await handleBillingWebhook(
      request("checkout.session.async_payment_succeeded", true, {
        customer: "cus_test",
        subscription: "sub_test",
        payment_status: "paid",
      }),
    );
    expect(mocks.apply).toHaveBeenCalledWith({}, expect.objectContaining({ status: "active" }));
  });
  it("recognizes portal cancellation scheduled through cancel_at", async () => {
    mocks.list.mockResolvedValue({
      data: [{ ...subscription, cancel_at: 1799000000, cancel_at_period_end: false }],
    });
    await handleBillingWebhook(request());
    expect(mocks.apply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ cancelAtPeriodEnd: true, periodEnd: new Date(1799000000 * 1000) }),
    );
  });
  it("records the actual end of a terminated subscription", async () => {
    mocks.list.mockResolvedValue({ data: [] });
    mocks.retrieve.mockResolvedValue({ ...subscription, status: "canceled", ended_at: 1798000000 });
    await handleBillingWebhook(request("customer.subscription.deleted"));
    expect(mocks.apply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ status: "canceled", periodEnd: new Date(1798000000 * 1000) }),
    );
  });
});
