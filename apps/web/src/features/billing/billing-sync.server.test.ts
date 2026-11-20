import { logger } from "@sellbridge/shared/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apply:
    vi.fn<(executor: unknown, input: { patch: Record<string, unknown> }) => Promise<boolean>>(),
  bySubscription: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  byReference: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  settle:
    vi.fn<
      (
        executor: unknown,
        input: { tenantId: string; reference: string; patch?: unknown },
      ) => Promise<boolean>
    >(),
  client: {
    getSubscription: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    listSubscriptionCharges: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
    deleteSubscription: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
    getCharge: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    changeSubscriptionValue: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    refundCharge: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    deleteCharge: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
  },
}));
vi.mock("@sellbridge/database/repositories", () => ({
  applyBillingState: mocks.apply,
  findBillingAccountBySubscription: mocks.bySubscription,
  findBillingAccountByPendingReference: mocks.byReference,
  settlePendingReference: mocks.settle,
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

/** The pro subscription renewing while an elite difference is still pending. */
function renewal() {
  mocks.client.getSubscription.mockResolvedValue({
    id: "sub_old",
    customer: "cus_pix",
    status: "ACTIVE",
    value: 197,
  });
  mocks.bySubscription.mockResolvedValue(
    account({ pendingPlan: "elite", pendingReference: "charge:pay_diff" }),
  );
}

/** A paid, cancelled Start month while a dearer Elite Pix waits for its first payment. */
function waitingAccount() {
  return account({
    plan: "start",
    cancelAtPeriodEnd: true,
    pendingPlan: "elite",
    pendingReference: "subscription:sub_waiting",
  });
}

function patchApplied(): Record<string, unknown> {
  const call = mocks.apply.mock.calls[0];
  if (call === undefined) throw new Error("no state was applied");
  return call[1].patch;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apply.mockResolvedValue(true);
  mocks.settle.mockResolvedValue(true);
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

  it("reports a card checkout subscription no account waits on, moving no money", async () => {
    mocks.client.getSubscription.mockResolvedValue({
      id: "sub_orphan",
      customer: "cus_card",
      status: "ACTIVE",
      value: 197,
      checkoutSession: "chk_cancelled",
    });
    mocks.client.listSubscriptionCharges.mockResolvedValue([
      { id: "pay_card", status: "CONFIRMED", value: 197, dueDate: "2026-11-20" },
    ]);

    const reported = vi.spyOn(logger, "error").mockImplementation(() => undefined);

    await syncBillingSubscription({ subscriptionId: "sub_orphan", eventId: "evt_orphan" });

    expect(mocks.client.refundCharge).not.toHaveBeenCalled();
    expect(mocks.client.deleteSubscription).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(reported).toHaveBeenCalledWith(
      "billing.orphan_checkout_subscription",
      expect.objectContaining({
        problemKey: "orphan-checkout:sub_orphan",
        subscriptionId: "sub_orphan",
        customerId: "cus_card",
        checkoutId: "chk_cancelled",
      }),
    );
    reported.mockRestore();
  });

  it("leaves alone a subscription that is already over or never came from a checkout", async () => {
    mocks.client.getSubscription.mockResolvedValue({
      id: "sub_gone",
      customer: "cus_card",
      status: "INACTIVE",
      value: 197,
      deleted: true,
      checkoutSession: "chk_old",
    });

    await syncBillingSubscription({ subscriptionId: "sub_gone", eventId: "evt_gone" });

    expect(mocks.client.refundCharge).not.toHaveBeenCalled();
    expect(mocks.client.deleteSubscription).not.toHaveBeenCalled();
  });

  describe("a dearer plan's Pix subscription waiting for its first payment", () => {
    beforeEach(() => {
      mocks.client.getSubscription.mockResolvedValue({
        id: "sub_waiting",
        customer: "cus_pix",
        status: "ACTIVE",
        value: 997,
        billingType: "PIX",
      });
      mocks.byReference.mockImplementation(async (_executor, reference) =>
        reference === "subscription:sub_waiting" ? waitingAccount() : null,
      );
    });

    it("leaves the paid month alone while that Pix is unpaid", async () => {
      mocks.client.listSubscriptionCharges.mockResolvedValue([
        { id: "pay_elite", status: "PENDING", value: 997, dueDate: "2026-11-20" },
      ]);

      await syncBillingSubscription({ subscriptionId: "sub_waiting", eventId: "evt_created" });

      expect(mocks.apply).not.toHaveBeenCalled();
      expect(mocks.client.deleteSubscription).not.toHaveBeenCalled();
    });

    it.each([
      ["its first Pix went overdue", "OVERDUE", PAID_UNTIL],
      ["the paid month ran out", "PENDING", new Date(Date.now() - 86_400_000)],
    ])("ends it once %s, leaving the account as it was", async (_label, status, periodEnd) => {
      mocks.byReference.mockImplementation(async (_executor, reference) =>
        reference === "subscription:sub_waiting" ? { ...waitingAccount(), periodEnd } : null,
      );
      mocks.client.listSubscriptionCharges.mockResolvedValue([
        { id: "pay_elite", status, value: 997, dueDate: "2026-11-20" },
      ]);

      await syncBillingSubscription({ subscriptionId: "sub_waiting", eventId: "evt_abandoned" });

      expect(mocks.client.deleteSubscription).toHaveBeenCalledWith("sub_waiting");
      expect(mocks.settle).toHaveBeenCalledWith(expect.anything(), {
        tenantId: "tenant-a",
        reference: "subscription:sub_waiting",
      });
      expect(mocks.apply).not.toHaveBeenCalled();
    });

    it("takes over with its first payment and ends the old subscription", async () => {
      mocks.client.listSubscriptionCharges.mockResolvedValue([
        {
          id: "pay_elite",
          status: "RECEIVED",
          value: 997,
          dueDate: "2026-11-20",
          paymentDate: "2026-11-20",
        },
      ]);

      await syncBillingSubscription({ subscriptionId: "sub_waiting", eventId: "evt_paid" });

      expect(patchApplied()).toMatchObject({
        subscriptionId: "sub_waiting",
        plan: "elite",
        paymentMethod: "pix",
        pendingReference: null,
        prepaidUntil: null,
      });
      expect(mocks.client.deleteSubscription).toHaveBeenCalledWith("sub_old");
    });
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

  it("binds a card checkout for a dearer plan without handing it the cheaper paid month", async () => {
    mocks.client.getSubscription.mockResolvedValue({
      id: "sub_card",
      customer: "cus_card",
      status: "ACTIVE",
      value: 997,
      checkoutSession: "chk_1",
    });
    mocks.byReference.mockResolvedValue(
      account({
        plan: "start",
        cancelAtPeriodEnd: true,
        pendingPlan: "elite",
        pendingReference: "checkout:chk_1",
      }),
    );

    await syncBillingSubscription({ subscriptionId: "sub_card", eventId: "evt_dearer" });

    expect(patchApplied()).toMatchObject({ plan: "elite", prepaidUntil: null, periodEnd: null });
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
    expect(mocks.settle).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "tenant-a",
      reference: "charge:pay_diff",
      patch: { plan: "elite", scheduledPlan: null, scheduledPlanAt: null },
    });
  });

  it("moves up even when a renewal read that started later was stored first", async () => {
    mocks.byReference.mockResolvedValue(
      account({ pendingPlan: "elite", pendingReference: "charge:pay_diff" }),
    );
    mocks.client.getCharge.mockResolvedValue({
      id: "pay_diff",
      status: "RECEIVED",
      value: 400,
      dueDate: "2026-12-04",
    });
    mocks.apply.mockResolvedValue(false);

    const outcome = await syncUpgradeCharge({ chargeId: "pay_diff", eventId: "evt_raced" });

    expect(outcome).toBe("applied");
    expect(mocks.settle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ patch: expect.objectContaining({ plan: "elite" }) }),
    );
  });

  // The month the difference covered ended on 2026-12-20 (Brasília).
  const coveredUntil = "upgrade:tenant-a:ref:1797735600000";

  it("gives back a difference paid only after the month it covered, keeping the plan", async () => {
    mocks.byReference.mockResolvedValue(
      account({ pendingPlan: "elite", pendingReference: "charge:pay_diff" }),
    );
    mocks.client.getCharge.mockResolvedValue({
      id: "pay_diff",
      status: "RECEIVED",
      value: 400,
      dueDate: "2026-12-04",
      paymentDate: "2026-12-20",
      externalReference: coveredUntil,
    });

    await syncUpgradeCharge({ chargeId: "pay_diff", eventId: "evt_late" });

    expect(mocks.client.refundCharge).toHaveBeenCalledWith("pay_diff", expect.any(String));
    expect(mocks.client.changeSubscriptionValue).not.toHaveBeenCalled();
    expect(mocks.settle).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "tenant-a",
      reference: "charge:pay_diff",
    });
  });

  it("moves up when a card confirmed the difference in time, though its money lands later", async () => {
    mocks.byReference.mockResolvedValue(
      account({ pendingPlan: "elite", pendingReference: "charge:pay_diff" }),
    );
    mocks.client.getCharge.mockResolvedValue({
      id: "pay_diff",
      status: "RECEIVED",
      value: 400,
      dueDate: "2026-12-04",
      confirmedDate: "2026-12-19",
      paymentDate: "2027-01-18",
      externalReference: coveredUntil,
    });

    await syncUpgradeCharge({ chargeId: "pay_diff", eventId: "evt_card" });

    expect(mocks.client.refundCharge).not.toHaveBeenCalled();
    expect(mocks.settle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ patch: expect.objectContaining({ plan: "elite" }) }),
    );
  });

  it("closes an unpaid difference once the month it covered is over", async () => {
    mocks.client.getSubscription.mockResolvedValue({
      id: "sub_old",
      customer: "cus_pix",
      status: "ACTIVE",
      value: 197,
    });
    mocks.bySubscription.mockResolvedValue(
      account({ pendingPlan: "elite", pendingReference: "charge:pay_diff" }),
    );
    mocks.client.getCharge.mockResolvedValue({
      id: "pay_diff",
      status: "OVERDUE",
      value: 400,
      dueDate: "2025-12-04",
      externalReference: "upgrade:tenant-a:ref:1766199600000",
    });

    await syncBillingSubscription({ subscriptionId: "sub_old", eventId: "evt_renewal" });

    expect(mocks.client.deleteCharge).toHaveBeenCalledWith("pay_diff");
    expect(mocks.settle).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "tenant-a",
      reference: "charge:pay_diff",
    });
  });

  it("forgets a late difference already given back without deleting it, and still renews", async () => {
    renewal();
    mocks.client.getCharge.mockResolvedValue({
      id: "pay_diff",
      status: "RECEIVED",
      value: 400,
      dueDate: "2025-12-04",
      paymentDate: "2025-12-20",
      externalReference: "upgrade:tenant-a:ref:1766199600000",
      refunds: [{ status: "PENDING" }],
    });

    await syncBillingSubscription({ subscriptionId: "sub_old", eventId: "evt_after_refund" });

    expect(mocks.client.deleteCharge).not.toHaveBeenCalled();
    expect(mocks.client.refundCharge).not.toHaveBeenCalled();
    expect(mocks.settle).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "tenant-a",
      reference: "charge:pay_diff",
    });
    expect(mocks.apply).toHaveBeenCalled();
  });

  it("keeps waiting on a lapsed difference whose card is still in risk analysis", async () => {
    renewal();
    mocks.client.getCharge.mockResolvedValue({
      id: "pay_diff",
      status: "AWAITING_RISK_ANALYSIS",
      value: 400,
      dueDate: "2025-12-04",
      externalReference: "upgrade:tenant-a:ref:1766199600000",
    });

    await syncBillingSubscription({ subscriptionId: "sub_old", eventId: "evt_in_review" });

    expect(mocks.client.deleteCharge).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.apply).toHaveBeenCalled();
  });

  it("gives back a late difference the renewal finds before its own notice", async () => {
    renewal();
    mocks.client.getCharge.mockResolvedValue({
      id: "pay_diff",
      status: "RECEIVED",
      value: 400,
      dueDate: "2025-12-04",
      paymentDate: "2025-12-20",
      externalReference: "upgrade:tenant-a:ref:1766199600000",
    });

    await syncBillingSubscription({ subscriptionId: "sub_old", eventId: "evt_renewal_late" });

    expect(mocks.client.refundCharge).toHaveBeenCalledWith("pay_diff", expect.any(String));
    expect(mocks.client.deleteCharge).not.toHaveBeenCalled();
    expect(mocks.apply).toHaveBeenCalled();
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
    expect(mocks.settle).not.toHaveBeenCalled();
  });
});
