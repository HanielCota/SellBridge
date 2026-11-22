import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  courtesy: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  saveCourtesy: vi.fn<(...input: unknown[]) => Promise<void>>(),
  deleteCourtesy: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
  tryLock: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
  apply:
    vi.fn<(executor: unknown, input: { tenantId: string; patch: unknown }) => Promise<boolean>>(),
  cleanupClient: vi.fn<() => unknown>(),
  client: {
    getSubscription: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    listSubscriptionCharges: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
    refundCharge: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    deleteSubscription: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
    deleteCharge: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
    cancelCheckout: vi.fn<(...input: unknown[]) => Promise<void>>(),
    getCharge: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    findSubscriptionsOfCustomer: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
    createPixSubscription: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    createRecurringCheckout: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    createOneOffCharge: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    createSubscriber: vi.fn<(...input: unknown[]) => Promise<string>>(),
  },
}));
vi.mock("@sellbridge/database/repositories", () => ({
  getBillingAccount: mocks.account,
  getBillingCourtesy: mocks.courtesy,
  saveBillingCourtesy: mocks.saveCourtesy,
  deleteBillingCourtesy: mocks.deleteCourtesy,
  saveBillingAccount: vi.fn<() => Promise<void>>(),
  tryLockBillingCheckout: mocks.tryLock,
  applyBillingState: mocks.apply,
  requireBillingOwner: vi.fn<() => Promise<void>>(),
  findBillingAccountByPendingReference: vi.fn<() => Promise<unknown>>(),
  findBillingAccountBySubscription: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/lib/server/environment", () => ({ environment: { BILLING_PAST_DUE_GRACE_DAYS: 7 } }));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("./billing-lock-database.server", () => ({
  billingLockDatabase: () => ({
    transaction: async (operation: (executor: object) => Promise<unknown>) => operation({}),
  }),
}));
vi.mock("./billing-config.server", () => ({
  billingClient: () => mocks.client,
  billingClientForCleanup: mocks.cleanupClient,
}));

import { AsaasError } from "@sellbridge/payments/asaas";
import { courtesyOverview, grantCourtesy, revokeCourtesy } from "./courtesy.server";

const NOW = new Date("2026-12-10T15:00:00Z");
const EXPIRES_AT = new Date("2027-03-01T03:00:00Z");
const grant = {
  tenantId: "tenant-a",
  plan: "elite" as const,
  expiresAt: EXPIRES_AT,
  reason: "Conta do cliente dono do projeto",
  adminId: "admin-a",
};

function paidAccount(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-a",
    customerId: "cus_a",
    subscriptionId: "sub_live",
    plan: "pro",
    status: "active",
    periodEnd: new Date("2026-12-20T03:00:00Z"),
    cancelAtPeriodEnd: false,
    pendingReference: null,
    ...overrides,
  };
}

/** Every call that would make Asaas charge someone. */
function chargingCalls() {
  return [
    mocks.client.createPixSubscription,
    mocks.client.createRecurringCheckout,
    mocks.client.createOneOffCharge,
    mocks.client.createSubscriber,
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.account.mockResolvedValue(null);
  mocks.courtesy.mockResolvedValue(null);
  mocks.deleteCourtesy.mockResolvedValue(true);
  mocks.tryLock.mockResolvedValue(true);
  mocks.apply.mockResolvedValue(true);
  mocks.cleanupClient.mockReturnValue(mocks.client);
  mocks.client.deleteSubscription.mockResolvedValue(true);
});

describe("granting a courtesy plan", () => {
  it("saves the plan, its end, the reason and who gave it", async () => {
    const result = await grantCourtesy(grant, NOW);

    expect(mocks.saveCourtesy).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "tenant-a",
      plan: "elite",
      expiresAt: EXPIRES_AT,
      reason: "Conta do cliente dono do projeto",
      grantedBy: "admin-a",
    });
    expect(result).toEqual({ previous: null, renewalStopped: false });
  });

  it("creates nothing at the payment provider for an account that pays nothing", async () => {
    await grantCourtesy(grant, NOW);

    for (const call of chargingCalls()) expect(call).not.toHaveBeenCalled();
    expect(mocks.cleanupClient).not.toHaveBeenCalled();
  });

  it("accepts a plan with no end date", async () => {
    await grantCourtesy({ ...grant, expiresAt: null }, NOW);

    expect(mocks.saveCourtesy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ expiresAt: null }),
    );
  });

  it("refuses an end that is not in the future", async () => {
    const attempt = grantCourtesy({ ...grant, expiresAt: NOW }, NOW);

    await expect(attempt).rejects.toMatchObject({ code: "VALIDATION" });
    expect(mocks.saveCourtesy).not.toHaveBeenCalled();
  });

  it("returns the plan it replaced, so the trail can tell a change from a grant", async () => {
    const previous = { tenantId: "tenant-a", plan: "start", expiresAt: null, reason: "Teste" };
    mocks.courtesy.mockResolvedValue(previous);

    const result = await grantCourtesy(grant, NOW);

    expect(result.previous).toEqual(previous);
  });
});

describe("granting to an account that already pays", () => {
  it("stops the renewal at Asaas and keeps the paid month, charging nothing new", async () => {
    mocks.account.mockResolvedValue(paidAccount());

    const result = await grantCourtesy(grant, NOW);

    expect(mocks.client.deleteSubscription).toHaveBeenCalledWith("sub_live");
    expect(mocks.client.refundCharge).not.toHaveBeenCalled();
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "tenant-a",
        patch: expect.objectContaining({ cancelAtPeriodEnd: true }),
      }),
    );
    expect(mocks.apply.mock.calls[0]?.[1].patch).not.toHaveProperty("periodEnd");
    expect(result.renewalStopped).toBe(true);
    for (const call of chargingCalls()) expect(call).not.toHaveBeenCalled();
  });

  it("gives nothing when Asaas cannot stop the renewal", async () => {
    mocks.account.mockResolvedValue(paidAccount());
    mocks.client.deleteSubscription.mockRejectedValue(
      new AsaasError("unavailable", { status: 503, codes: [] }),
    );

    await expect(grantCourtesy(grant, NOW)).rejects.toMatchObject({ code: "EXTERNAL_PROVIDER" });
    expect(mocks.saveCourtesy).not.toHaveBeenCalled();
  });

  it("gives nothing when the subscription cannot be reached at all", async () => {
    mocks.account.mockResolvedValue(paidAccount());
    mocks.cleanupClient.mockReturnValue(null);

    await expect(grantCourtesy(grant, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.saveCourtesy).not.toHaveBeenCalled();
  });

  it("leaves a subscription already cancelled as it is", async () => {
    mocks.account.mockResolvedValue(paidAccount({ cancelAtPeriodEnd: true }));

    const result = await grantCourtesy(grant, NOW);

    expect(mocks.client.deleteSubscription).not.toHaveBeenCalled();
    expect(result.renewalStopped).toBe(false);
  });

  it("closes a card checkout opened and never paid", async () => {
    mocks.account.mockResolvedValue(
      paidAccount({ subscriptionId: null, status: "free", pendingReference: "checkout:chk_1" }),
    );
    mocks.client.findSubscriptionsOfCustomer.mockResolvedValue([]);

    const result = await grantCourtesy(grant, NOW);

    expect(mocks.client.cancelCheckout).toHaveBeenCalledWith("chk_1");
    expect(result.renewalStopped).toBe(false);
    expect(mocks.saveCourtesy).toHaveBeenCalledTimes(1);
  });
});

describe("taking a courtesy plan back", () => {
  it("deletes it and returns what was taken, for the trail", async () => {
    const courtesy = { tenantId: "tenant-a", plan: "elite", expiresAt: EXPIRES_AT, reason: "x" };
    mocks.courtesy.mockResolvedValue(courtesy);

    const taken = await revokeCourtesy("tenant-a");

    expect(mocks.deleteCourtesy).toHaveBeenCalledWith(expect.anything(), "tenant-a");
    expect(taken).toEqual(courtesy);
  });

  it("waits for a grant still running instead of deleting what it gives", async () => {
    mocks.courtesy.mockResolvedValue({ tenantId: "tenant-a", plan: "elite", expiresAt: null });
    mocks.tryLock.mockResolvedValue(false);

    await expect(revokeCourtesy("tenant-a")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.tryLock).toHaveBeenCalledWith(expect.anything(), "tenant-a");
    expect(mocks.deleteCourtesy).not.toHaveBeenCalled();
  });

  it("refuses when the account has none", async () => {
    await expect(revokeCourtesy("tenant-a")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.deleteCourtesy).not.toHaveBeenCalled();
  });
});

describe("courtesy overview", () => {
  it("shows the plan in force and the plan the account still pays for", async () => {
    mocks.courtesy.mockResolvedValue({ plan: "elite", expiresAt: EXPIRES_AT, reason: "Dono" });
    mocks.account.mockResolvedValue(paidAccount());

    const overview = await courtesyOverview("tenant-a", NOW);

    expect(overview).toEqual({
      courtesy: {
        planId: "elite",
        planName: "Elite",
        expiresAt: EXPIRES_AT.toISOString(),
        reason: "Dono",
      },
      paidPlanName: "Pro",
    });
  });

  it("shows nothing once the plan is past its end", async () => {
    mocks.courtesy.mockResolvedValue({ plan: "elite", expiresAt: EXPIRES_AT, reason: "Dono" });

    const overview = await courtesyOverview("tenant-a", EXPIRES_AT);

    expect(overview).toEqual({ courtesy: null, paidPlanName: null });
  });
});
