import { beforeEach, describe, expect, it, vi } from "vitest";
import { forbiddenError } from "@sellbridge/shared/errors";
const mocks = vi.hoisted(() => ({
  owner: vi.fn<(...input: unknown[]) => Promise<void>>(),
  account: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  save: vi.fn<(...input: unknown[]) => Promise<void>>(),
  lock: vi.fn<(...input: unknown[]) => Promise<void>>(),
  tryLock: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
  inTransaction: { value: false },
  customer: vi.fn<(...input: unknown[]) => Promise<{ id: string }>>(),
  subscriptions: vi.fn<(...input: unknown[]) => Promise<{ data: { status: string }[] }>>(),
  sessions: vi.fn<(...input: unknown[]) => Promise<{ data: { id: string }[] }>>(),
  expire: vi.fn<(...input: unknown[]) => Promise<void>>(),
  checkout: vi.fn<(...input: unknown[]) => Promise<{ url: string }>>(),
  portal: vi.fn<(...input: unknown[]) => Promise<{ url: string }>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  requireBillingOwner: mocks.owner,
  getBillingAccount: mocks.account,
  saveBillingCustomer: mocks.save,
  lockBillingTenant: mocks.lock,
  tryLockBillingCheckout: mocks.tryLock,
  billingUsage: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/lib/server/environment", () => ({
  environment: { APP_URL: "https://sellbridge.test" },
}));
vi.mock("@/lib/server/database", () => ({
  database: {
    transaction: async (operation: (executor: object) => Promise<unknown>) => {
      mocks.inTransaction.value = true;
      try {
        return await operation({});
      } finally {
        mocks.inTransaction.value = false;
      }
    },
  },
}));
vi.mock("./stripe.server", () => ({
  billingConfigured: () => true,
  availablePlans: vi.fn<() => Promise<unknown>>(),
  priceId: () => "price_pro",
  stripeClient: () => ({
    customers: { create: mocks.customer },
    subscriptions: { list: mocks.subscriptions },
    checkout: { sessions: { list: mocks.sessions, expire: mocks.expire, create: mocks.checkout } },
    billingPortal: { sessions: { create: mocks.portal } },
  }),
}));
import { openBillingPortal, startSubscription } from "./billing.server";
const input = { tenantId: "tenant-a", userId: "owner-a", plan: "pro" as const };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue();
  mocks.tryLock.mockResolvedValue(true);
  mocks.account.mockResolvedValue(null);
  mocks.customer.mockResolvedValue({ id: "cus_tenant_a" });
  mocks.subscriptions.mockResolvedValue({ data: [] });
  mocks.sessions.mockResolvedValue({ data: [] });
  mocks.checkout.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
  mocks.portal.mockResolvedValue({ url: "https://billing.stripe.com/test" });
});
describe("owner subscription management", () => {
  it("denies non-owners before contacting the payment provider", async () => {
    mocks.owner.mockRejectedValue(forbiddenError());
    await expect(startSubscription(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(openBillingPortal(input.tenantId, input.userId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.portal).not.toHaveBeenCalled();
  });
  it("binds checkout to the tenant's idempotent customer and configured price", async () => {
    await startSubscription(input);
    expect(mocks.customer).toHaveBeenCalledWith(
      { metadata: { tenantId: input.tenantId } },
      expect.objectContaining({ idempotencyKey: "billing-customer-tenant-a" }),
    );
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_tenant_a",
        line_items: [{ price: "price_pro", quantity: 1 }],
        client_reference_id: input.tenantId,
      }),
      { timeout: 5_000, maxNetworkRetries: 1 },
    );
  });
  it("reuses the bound customer instead of creating another", async () => {
    mocks.account.mockResolvedValue({ customerId: "cus_existing" });
    await startSubscription(input);
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
      expect.anything(),
    );
  });
  it("opens the portal instead of selling a duplicate subscription", async () => {
    mocks.subscriptions.mockResolvedValue({ data: [{ status: "past_due" }] });
    expect(await startSubscription(input)).toEqual({ url: "https://billing.stripe.com/test" });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("expires pending checkout links before issuing a replacement", async () => {
    mocks.sessions.mockResolvedValue({ data: [{ id: "cs_old" }] });
    await startSubscription(input);
    expect(mocks.expire).toHaveBeenCalledWith("cs_old", {}, expect.anything());
    expect(mocks.expire.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkout.mock.invocationCallOrder[0] ?? 0,
    );
  });
  // Regression (item 16.a, N5): checkout locked the organization row while it waited on Stripe,
  // and every publication and store connection of the tenant waited behind it.
  it("never locks the organization row and creates the customer outside any transaction", async () => {
    let customerInTransaction: boolean | null = null;
    mocks.customer.mockImplementation(async () => {
      customerInTransaction = mocks.inTransaction.value;
      return { id: "cus_tenant_a" };
    });
    await startSubscription(input);
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(customerInTransaction).toBe(false);
    expect(mocks.tryLock).toHaveBeenCalledWith({}, input.tenantId);
  });
  // Review of item 16: these two ran with the client defaults (~45 s each) inside the transaction.
  it("bounds the portal and the expiry of old checkout links", async () => {
    const limits = { timeout: 5_000, maxNetworkRetries: 1 };
    mocks.sessions.mockResolvedValue({ data: [{ id: "cs_old" }] });
    await startSubscription(input);
    expect(mocks.expire).toHaveBeenCalledWith("cs_old", {}, limits);
    mocks.subscriptions.mockResolvedValue({ data: [{ status: "active" }] });
    await startSubscription(input);
    expect(mocks.portal).toHaveBeenCalledWith(expect.anything(), limits);
  });
  // Regression (idioma-pt, 25/10/2026): Stripe picked the page language from the browser, so the
  // payment and subscription pages could open in English.
  it("opens the checkout and the portal in Brazilian Portuguese", async () => {
    await startSubscription(input);
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "pt-BR" }),
      expect.anything(),
    );
    mocks.subscriptions.mockResolvedValue({ data: [{ status: "active" }] });
    await startSubscription(input);
    expect(mocks.portal).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "pt-BR" }),
      expect.anything(),
    );
  });
  it("refuses a second checkout while one is being opened", async () => {
    mocks.tryLock.mockResolvedValue(false);
    await expect(startSubscription(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.sessions).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
});
