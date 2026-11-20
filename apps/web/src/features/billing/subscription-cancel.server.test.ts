import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owner: vi.fn<(...input: unknown[]) => Promise<void>>(),
  account: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  save: vi.fn<(...input: unknown[]) => Promise<void>>(),
  apply:
    vi.fn<(executor: unknown, input: { tenantId: string; patch: unknown }) => Promise<boolean>>(),
  client: {
    getSubscription: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    listSubscriptionCharges: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
    refundCharge: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    deleteSubscription: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
    deleteCharge: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
    cancelCheckout: vi.fn<(...input: unknown[]) => Promise<void>>(),
  },
}));
vi.mock("@sellbridge/database/repositories", () => ({
  requireBillingOwner: mocks.owner,
  getBillingAccount: mocks.account,
  saveBillingAccount: mocks.save,
  tryLockBillingCheckout: async () => true,
  applyBillingState: mocks.apply,
  findBillingAccountByPendingReference: vi.fn<() => Promise<unknown>>(),
  findBillingAccountBySubscription: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/lib/server/environment", () => ({ environment: { BILLING_PAST_DUE_GRACE_DAYS: 7 } }));
vi.mock("@/lib/server/database", () => ({
  database: {
    transaction: async (operation: (executor: object) => Promise<unknown>) => operation({}),
  },
}));
vi.mock("./billing-lock-database.server", () => ({
  billingLockDatabase: () => ({
    transaction: async (operation: (executor: object) => Promise<unknown>) => operation({}),
  }),
}));
vi.mock("./billing-config.server", () => ({ billingClient: () => mocks.client }));

import { cancelSubscription } from "./subscription-cancel.server";

const input = { tenantId: "tenant-a", userId: "owner-a" };
const PERIOD_END = new Date("2026-12-20T03:00:00Z");
const FIRST_FEE = {
  id: "pay_first",
  status: "RECEIVED",
  value: 197,
  dueDate: "2026-11-19",
  paymentDate: "2026-11-19",
};

function account(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-a",
    customerId: "cus_a",
    subscriptionId: "sub_live",
    plan: "pro",
    status: "active",
    periodEnd: PERIOD_END,
    cancelAtPeriodEnd: false,
    paymentMethod: "pix",
    pendingReference: null,
    prepaidUntil: null,
    firstPaidOn: "2026-11-19",
    ...overrides,
  };
}

/** Noon in Brasília on the given day. */
function setToday(day: string) {
  vi.setSystemTime(new Date(`${day}T15:00:00Z`));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  mocks.owner.mockResolvedValue();
  // Applied state lands where saved state does, so each case reads what cancelling wrote.
  mocks.apply.mockImplementation(async (executor, applied) => {
    await mocks.save(executor, applied.tenantId, applied.patch);
    return true;
  });
  mocks.account.mockResolvedValue(account());
  mocks.client.getSubscription.mockResolvedValue({
    id: "sub_live",
    customer: "cus_a",
    status: "ACTIVE",
    value: 197,
  });
  mocks.client.listSubscriptionCharges.mockResolvedValue([FIRST_FEE]);
  mocks.client.deleteSubscription.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cancellation", () => {
  it("stamps the cancellation so an earlier notice sync cannot write the plan back", async () => {
    setToday("2026-11-27");

    await cancelSubscription(input);

    expect(mocks.apply).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "tenant-a",
      eventId: null,
      observedAt: Date.now(),
      patch: expect.objectContaining({ cancelAtPeriodEnd: true }),
    });
  });

  it("keeps the plan until the end of the paid month, with no refund after 7 days", async () => {
    setToday("2026-11-27");

    const result = await cancelSubscription(input);

    expect(mocks.client.refundCharge).not.toHaveBeenCalled();
    expect(mocks.client.deleteSubscription).toHaveBeenCalledWith("sub_live");
    expect(mocks.save).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-a",
      expect.not.objectContaining({ status: expect.anything() }),
    );
    expect(result).toEqual({ endsAt: PERIOD_END.toISOString(), refundCents: null });
  });

  it("gives the first monthly fee back in full on the seventh day and ends the plan now", async () => {
    setToday("2026-11-26");

    const result = await cancelSubscription(input);

    expect(mocks.client.refundCharge).toHaveBeenCalledWith("pay_first", expect.any(String));
    expect(mocks.client.refundCharge.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.client.deleteSubscription.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-a",
      expect.objectContaining({ status: "canceled", cancelAtPeriodEnd: true }),
    );
    expect(result).toEqual({ endsAt: null, refundCents: 19_700 });
  });

  it("never refunds the first fee of a subscription that took over a paid month", async () => {
    setToday("2026-11-20");
    mocks.account.mockResolvedValue(account({ prepaidUntil: PERIOD_END }));

    const result = await cancelSubscription(input);

    expect(mocks.client.refundCharge).not.toHaveBeenCalled();
    expect(result.refundCents).toBeNull();
  });

  it("leaves the subscription running when the refund fails", async () => {
    setToday("2026-11-20");
    mocks.client.refundCharge.mockRejectedValue(new Error("Asaas fora do ar"));

    await expect(cancelSubscription(input)).rejects.toThrow("Asaas fora do ar");
    expect(mocks.client.deleteSubscription).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("ends the plan once the first fee is refunded, even when ending the subscription fails", async () => {
    setToday("2026-11-20");
    mocks.client.refundCharge.mockResolvedValue({});
    mocks.client.deleteSubscription.mockRejectedValue(new Error("Asaas fora do ar"));

    await expect(cancelSubscription(input)).rejects.toThrow("Asaas fora do ar");
    expect(mocks.client.refundCharge).toHaveBeenCalledWith("pay_first", expect.any(String));
    expect(mocks.save).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-a",
      expect.objectContaining({ status: "canceled" }),
    );
  });

  it("refuses to cancel twice", async () => {
    mocks.account.mockResolvedValue(account({ cancelAtPeriodEnd: true }));

    await expect(cancelSubscription(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.client.deleteSubscription).not.toHaveBeenCalled();
  });
});
