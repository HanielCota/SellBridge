import { beforeEach, describe, expect, it, vi } from "vitest";
import { forbiddenError } from "@sellbridge/shared/errors";
const mocks = vi.hoisted(() => ({
  owner: vi.fn<(...input: unknown[]) => Promise<void>>(),
  account: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  save: vi.fn<(...input: unknown[]) => Promise<void>>(),
  lock: vi.fn<(...input: unknown[]) => Promise<void>>(),
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
  billingUsage: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/lib/server/environment", () => ({
  environment: { APP_URL: "https://sellbridge.test" },
}));
vi.mock("@/lib/server/database", () => ({
  database: {
    transaction: async (operation: (executor: object) => Promise<unknown>) => await operation({}),
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
      { idempotencyKey: "billing-customer-tenant-a" },
    );
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_tenant_a",
        line_items: [{ price: "price_pro", quantity: 1 }],
        client_reference_id: input.tenantId,
      }),
    );
  });
  it("reuses the bound customer instead of creating another", async () => {
    mocks.account.mockResolvedValue({ customerId: "cus_existing" });
    await startSubscription(input);
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
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
    expect(mocks.expire).toHaveBeenCalledWith("cs_old");
    expect(mocks.expire.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkout.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
