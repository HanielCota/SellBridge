import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apply:
    vi.fn<(executor: unknown, input: { patch: Record<string, unknown> }) => Promise<boolean>>(),
  bySubscription: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  byReference: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  client: {
    getSubscription: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    listSubscriptionCharges: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
    deleteSubscription: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
    getCharge: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    changeSubscriptionValue: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  },
}));
vi.mock("@sellbridge/database/repositories", () => ({
  applyBillingState: mocks.apply,
  findBillingAccountBySubscription: mocks.bySubscription,
  findBillingAccountByPendingReference: mocks.byReference,
  getBillingAccount: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/lib/server/environment", () => ({ environment: { BILLING_PAST_DUE_GRACE_DAYS: 7 } }));
vi.mock("@/lib/server/database", () => ({
  database: {
    transaction: async (operation: (executor: object) => Promise<unknown>) => operation({}),
  },
}));
vi.mock("./billing-config.server", () => ({ billingClient: () => mocks.client }));

import { syncBillingSubscription, syncUpgradeCharge } from "./billing-sync.server";

const PAID_UNTIL = new Date(Date.now() + 10 * 86_400_000);

function account(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-a",
    customerId: "cus_pix",
    subscriptionId: "sub_old",
    plan: "pro",
    status: "active",
    periodEnd: PAID_UNTIL,
    cancelAtPeriodEnd: false,
    paymentMethod: "pix",
    scheduledPlan: null,
    scheduledPlanAt: null,
    pendingPlan: null,
    pendingReference: null,
    prepaidUntil: null,
    ...overrides,
  };
}

function patchApplied(): Record<string, unknown> {
  const call = mocks.apply.mock.calls[0];
  if (call === undefined) throw new Error("no state was applied");
  return call[1].patch;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apply.mockResolvedValue(true);
  mocks.bySubscription.mockResolvedValue(null);
  mocks.byReference.mockResolvedValue(null);
  mocks.client.listSubscriptionCharges.mockResolvedValue([]);
});

describe("subscription read back from Asaas", () => {
  it("ignores a subscription that belongs to no account", async () => {
    mocks.client.getSubscription.mockResolvedValue({
      id: "sub_x",
      customer: "cus_x",
      status: "ACTIVE",
      value: 97,
    });

    await syncBillingSubscription({ subscriptionId: "sub_x", eventId: "evt_1" });

    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("binds a card checkout's subscription, keeps the paid month and ends the old one", async () => {
    mocks.client.getSubscription.mockResolvedValue({
      id: "sub_card",
      customer: "cus_card",
      status: "ACTIVE",
      value: 197,
      checkoutSession: "chk_1",
    });
    mocks.byReference.mockResolvedValue(
      account({ pendingPlan: "pro", pendingReference: "checkout:chk_1" }),
    );

    await syncBillingSubscription({ subscriptionId: "sub_card", eventId: "evt_2" });

    expect(mocks.byReference).toHaveBeenCalledWith(expect.anything(), "checkout:chk_1");
    expect(patchApplied()).toMatchObject({
      subscriptionId: "sub_card",
      customerId: "cus_card",
      paymentMethod: "credit_card",
      pendingReference: null,
      prepaidUntil: PAID_UNTIL,
      status: "active",
      periodEnd: PAID_UNTIL,
    });
    expect(mocks.client.deleteSubscription).toHaveBeenCalledWith("sub_old");
  });

  it("does not end the old subscription when a newer read already won", async () => {
    mocks.client.getSubscription.mockResolvedValue({
      id: "sub_card",
      customer: "cus_card",
      status: "ACTIVE",
      value: 197,
      checkoutSession: "chk_1",
    });
    mocks.byReference.mockResolvedValue(account({ pendingReference: "checkout:chk_1" }));
    mocks.apply.mockResolvedValue(false);

    await syncBillingSubscription({ subscriptionId: "sub_card", eventId: "evt_3" });

    expect(mocks.client.deleteSubscription).not.toHaveBeenCalled();
  });

  it("fails processing if the former subscription cannot be ended", async () => {
    mocks.client.getSubscription.mockResolvedValue({
      id: "sub_card",
      customer: "cus_card",
      status: "ACTIVE",
      value: 197,
      checkoutSession: "chk_1",
    });
    mocks.byReference.mockResolvedValue(account({ pendingReference: "checkout:chk_1" }));
    mocks.client.deleteSubscription.mockRejectedValueOnce(new Error("Asaas unavailable"));

    await expect(
      syncBillingSubscription({ subscriptionId: "sub_card", eventId: "evt_retry" }),
    ).rejects.toThrow("Asaas unavailable");
  });

  it("turns a scheduled smaller plan into the plan once its first month is paid", async () => {
    mocks.client.getSubscription.mockResolvedValue({
      id: "sub_old",
      customer: "cus_pix",
      status: "ACTIVE",
      value: 97,
    });
    mocks.bySubscription.mockResolvedValue(
      account({
        plan: "elite",
        scheduledPlan: "start",
        scheduledPlanAt: new Date("2026-12-19T03:00:00Z"),
      }),
    );
    mocks.client.listSubscriptionCharges.mockResolvedValue([
      { id: "pay_2", status: "RECEIVED", value: 97, dueDate: "2026-12-19" },
    ]);

    await syncBillingSubscription({ subscriptionId: "sub_old", eventId: "evt_4" });

    expect(patchApplied()).toMatchObject({
      plan: "start",
      scheduledPlan: null,
      scheduledPlanAt: null,
    });
  });
});

describe("upgrade difference", () => {
  it("moves to the bigger plan and its monthly price once the difference is paid", async () => {
    mocks.byReference.mockResolvedValue(
      account({ pendingPlan: "elite", pendingReference: "charge:pay_diff" }),
    );
    mocks.client.getCharge.mockResolvedValue({
      id: "pay_diff",
      status: "RECEIVED",
      value: 400,
      dueDate: "2026-12-04",
    });

    await syncUpgradeCharge({ chargeId: "pay_diff", eventId: "evt_5" });

    expect(mocks.client.changeSubscriptionValue).toHaveBeenCalledWith("sub_old", {
      valueCents: 99_700,
      description: "SellBridge Elite",
    });
    expect(patchApplied()).toMatchObject({
      plan: "elite",
      pendingPlan: null,
      pendingReference: null,
    });
  });

  it("waits while the difference is unpaid", async () => {
    mocks.byReference.mockResolvedValue(
      account({ pendingPlan: "elite", pendingReference: "charge:pay_diff" }),
    );
    mocks.client.getCharge.mockResolvedValue({
      id: "pay_diff",
      status: "PENDING",
      value: 400,
      dueDate: "2026-12-04",
    });

    await syncUpgradeCharge({ chargeId: "pay_diff", eventId: "evt_6" });

    expect(mocks.client.changeSubscriptionValue).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});
