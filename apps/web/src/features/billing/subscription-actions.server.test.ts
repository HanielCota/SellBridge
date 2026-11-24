import { beforeEach, describe, expect, it, vi } from "vitest";
import { forbiddenError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";

const mocks = vi.hoisted(() => ({
  owner: vi.fn<(...input: unknown[]) => Promise<void>>(),
  account: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  save: vi.fn<(...input: unknown[]) => Promise<void>>(),
  tryLock: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
  syncSubscription: vi.fn<(...input: unknown[]) => Promise<void>>(),
  syncUpgrade: vi.fn<(...input: unknown[]) => Promise<string>>(),
  settle: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
  planChangeOf: vi.fn<(typeof import("./plan-change"))["planChangeOf"]>(),
  holder: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  email: vi.fn<(...input: unknown[]) => Promise<string | null>>(),
  courtesy: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  enableInvoices: vi.fn<(...input: unknown[]) => Promise<string>>(),
  client: {
    findSubscriber: vi.fn<(...input: unknown[]) => Promise<string | null>>(),
    createSubscriber: vi.fn<(...input: unknown[]) => Promise<string>>(),
    createPixSubscription: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    listSubscriptionCharges: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
    getSubscription: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    createRecurringCheckout: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    cancelCheckout: vi.fn<(...input: unknown[]) => Promise<void>>(),
    deleteSubscription: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
    deleteCharge: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
    changeSubscriptionValue: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    createOneOffCharge: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    getCharge: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
    findSubscriptionsOfCustomer: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
  },
}));
vi.mock("@sellbridge/database/repositories", () => ({
  requireBillingOwner: mocks.owner,
  getBillingAccount: mocks.account,
  getBillingCourtesy: mocks.courtesy,
  saveBillingAccount: mocks.save,
  tryLockBillingCheckout: mocks.tryLock,
  findBillingHolder: mocks.holder,
  findBillingOwnerEmail: mocks.email,
  applyBillingState: vi.fn<() => Promise<boolean>>(),
  findBillingAccountByPendingReference: vi.fn<() => Promise<unknown>>(),
  findBillingAccountBySubscription: vi.fn<() => Promise<unknown>>(),
  settlePendingReference: mocks.settle,
}));
vi.mock("@/lib/server/environment", () => ({
  environment: { APP_URL: "https://sellbridge.test", BILLING_PAST_DUE_GRACE_DAYS: 7 },
}));
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
vi.mock("./subscription-invoices.server", () => ({
  enableSubscriptionInvoices: mocks.enableInvoices,
}));
vi.mock("./plan-change", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan-change")>()),
  planChangeOf: mocks.planChangeOf,
}));
vi.mock("./billing-sync.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./billing-sync.server")>()),
  syncBillingSubscription: mocks.syncSubscription,
  syncUpgradeCharge: mocks.syncUpgrade,
}));

import { AsaasError, asaasDueDate } from "@sellbridge/payments/asaas";
import { changePlan, openPendingPayment, startSubscription } from "./subscription-actions.server";

const realPlanChange = await vi.importActual<typeof import("./plan-change")>("./plan-change");

const input = { tenantId: "tenant-a", userId: "owner-a", plan: "pro" as const };
const HOLDER = {
  fullName: "Loja Teste",
  cpf: "24971563792",
  phone: null,
  company: null,
  address: null,
};
const PIX_SUBSCRIPTION = { id: "sub_new", customer: "cus_a", status: "ACTIVE", value: 197 };
const OPEN_PIX = {
  id: "pay_1",
  status: "PENDING",
  value: 197,
  dueDate: "2026-11-19",
  invoiceUrl: "https://asaas.test/i/1",
};

function liveAccount(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-a",
    customerId: "cus_a",
    subscriptionId: "sub_live",
    plan: "pro",
    status: "active",
    periodEnd: new Date(Date.now() + 10 * 86_400_000),
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

/** A Start month paid up front, cancelled so it does not renew. */
function cancelledStart(status: string) {
  return liveAccount({ plan: "start", status, cancelAtPeriodEnd: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue();
  mocks.tryLock.mockResolvedValue(true);
  mocks.account.mockResolvedValue(null);
  mocks.courtesy.mockResolvedValue(null);
  mocks.holder.mockResolvedValue(HOLDER);
  mocks.email.mockResolvedValue("dono@example.com");
  mocks.client.findSubscriber.mockResolvedValue(null);
  mocks.client.findSubscriptionsOfCustomer.mockResolvedValue([]);
  mocks.settle.mockResolvedValue(true);
  mocks.planChangeOf.mockImplementation(realPlanChange.planChangeOf);
  mocks.client.createSubscriber.mockResolvedValue("cus_a");
  mocks.client.createPixSubscription.mockResolvedValue(PIX_SUBSCRIPTION);
  mocks.client.listSubscriptionCharges.mockResolvedValue([OPEN_PIX]);
  mocks.client.createRecurringCheckout.mockResolvedValue({
    checkoutId: "chk_1",
    url: "https://asaas.test/c/1",
  });
});

describe("first subscription", () => {
  it("stops a replacement when an old checkout could still charge the customer", async () => {
    mocks.account.mockResolvedValue(
      liveAccount({
        status: "incomplete",
        subscriptionId: null,
        pendingReference: "checkout:chk_old",
      }),
    );
    mocks.client.cancelCheckout.mockRejectedValueOnce(new Error("Asaas unavailable"));

    await expect(startSubscription({ ...input, method: "pix" })).rejects.toThrow(
      "Asaas unavailable",
    );

    expect(mocks.client.cancelCheckout).toHaveBeenCalledWith("chk_old");
    expect(mocks.client.createPixSubscription).not.toHaveBeenCalled();
  });

  it("syncs a first fee Asaas already received instead of deleting its subscription", async () => {
    mocks.account.mockResolvedValue(liveAccount({ status: "incomplete", periodEnd: null }));
    mocks.client.listSubscriptionCharges.mockResolvedValue([
      { ...OPEN_PIX, status: "RECEIVED", paymentDate: "2026-11-19" },
    ]);

    await expect(startSubscription({ ...input, method: "pix" })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(mocks.syncSubscription).toHaveBeenCalledWith({
      subscriptionId: "sub_live",
      eventId: null,
    });
    expect(mocks.client.deleteSubscription).not.toHaveBeenCalled();
    expect(mocks.client.createPixSubscription).not.toHaveBeenCalled();
  });

  it("syncs an upgrade difference Asaas already received instead of deleting it", async () => {
    mocks.account.mockResolvedValue(
      liveAccount({
        status: "canceled",
        subscriptionId: null,
        pendingReference: "charge:pay_diff",
      }),
    );
    mocks.client.getCharge.mockResolvedValue({ ...OPEN_PIX, id: "pay_diff", status: "CONFIRMED" });
    mocks.syncUpgrade.mockResolvedValue("applied");

    await expect(startSubscription({ ...input, method: "pix" })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(mocks.syncUpgrade).toHaveBeenCalledWith({ chargeId: "pay_diff", eventId: null });
    expect(mocks.client.deleteCharge).not.toHaveBeenCalled();
  });

  it("goes on after a difference paid too late was given back, without deleting it", async () => {
    mocks.account.mockResolvedValue(
      liveAccount({
        status: "canceled",
        subscriptionId: null,
        pendingReference: "charge:pay_diff",
      }),
    );
    mocks.client.getCharge.mockResolvedValue({ ...OPEN_PIX, id: "pay_diff", status: "RECEIVED" });
    mocks.syncUpgrade.mockResolvedValue("given_back");

    await startSubscription({ ...input, method: "pix" });

    expect(mocks.client.deleteCharge).not.toHaveBeenCalled();
    expect(mocks.client.createPixSubscription).toHaveBeenCalled();
  });

  it("stops while the difference's card is still in risk analysis, deleting nothing", async () => {
    mocks.account.mockResolvedValue(
      liveAccount({
        status: "canceled",
        subscriptionId: null,
        pendingReference: "charge:pay_diff",
      }),
    );
    mocks.client.getCharge.mockResolvedValue({
      ...OPEN_PIX,
      id: "pay_diff",
      status: "AWAITING_RISK_ANALYSIS",
    });

    await expect(startSubscription({ ...input, method: "pix" })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(mocks.client.deleteCharge).not.toHaveBeenCalled();
    expect(mocks.client.createPixSubscription).not.toHaveBeenCalled();
  });

  it("stops and tells the team while the difference is under a chargeback", async () => {
    mocks.account.mockResolvedValue(
      liveAccount({
        status: "canceled",
        subscriptionId: null,
        pendingReference: "charge:pay_diff",
      }),
    );
    mocks.client.getCharge.mockResolvedValue({
      ...OPEN_PIX,
      id: "pay_diff",
      status: "CHARGEBACK_REQUESTED",
    });
    const reported = vi.spyOn(logger, "error").mockImplementation(() => undefined);

    await expect(startSubscription({ ...input, method: "pix" })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(reported).toHaveBeenCalledWith(
      "billing.difference_in_dispute",
      expect.objectContaining({ problemKey: "difference-dispute:pay_diff" }),
    );
    expect(mocks.client.deleteCharge).not.toHaveBeenCalled();
    reported.mockRestore();
  });

  it("stops when a paid difference no longer matches what the account waits on", async () => {
    mocks.account.mockResolvedValue(
      liveAccount({
        status: "canceled",
        subscriptionId: null,
        pendingReference: "charge:pay_diff",
      }),
    );
    mocks.client.getCharge.mockResolvedValue({ ...OPEN_PIX, id: "pay_diff", status: "RECEIVED" });
    mocks.syncUpgrade.mockResolvedValue("not_waiting");

    await expect(startSubscription({ ...input, method: "pix" })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(mocks.client.createPixSubscription).not.toHaveBeenCalled();
  });

  it("never deletes a difference Asaas already gave back", async () => {
    mocks.account.mockResolvedValue(
      liveAccount({
        status: "canceled",
        subscriptionId: null,
        pendingReference: "charge:pay_diff",
      }),
    );
    mocks.client.getCharge.mockResolvedValue({
      ...OPEN_PIX,
      id: "pay_diff",
      status: "RECEIVED",
      refunds: [{ status: "DONE" }],
    });

    await startSubscription({ ...input, method: "pix" });

    expect(mocks.client.deleteCharge).not.toHaveBeenCalled();
    expect(mocks.syncUpgrade).not.toHaveBeenCalled();
  });

  it("syncs the subscription a paid card checkout created instead of cancelling the checkout", async () => {
    mocks.account.mockResolvedValue(
      liveAccount({
        status: "canceled",
        subscriptionId: null,
        pendingReference: "checkout:chk_paid",
      }),
    );
    mocks.client.findSubscriptionsOfCustomer.mockResolvedValue([
      { ...PIX_SUBSCRIPTION, id: "sub_from_checkout", checkoutSession: "chk_paid" },
    ]);

    await expect(startSubscription({ ...input, method: "pix" })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(mocks.syncSubscription).toHaveBeenCalledWith({
      subscriptionId: "sub_from_checkout",
      eventId: null,
    });
    expect(mocks.client.cancelCheckout).not.toHaveBeenCalled();
  });

  it("deletes an incomplete subscription Asaas still has unpaid", async () => {
    mocks.account.mockResolvedValue(liveAccount({ status: "incomplete", periodEnd: null }));

    await startSubscription({ ...input, method: "pix" });

    expect(mocks.client.deleteSubscription).toHaveBeenCalledWith("sub_live");
    expect(mocks.syncSubscription).not.toHaveBeenCalled();
  });

  it("keeps an uncertain creation reserved and refuses to create a second subscription", async () => {
    mocks.client.createPixSubscription.mockRejectedValueOnce(new Error("Asaas timed out"));

    await expect(startSubscription({ ...input, method: "pix" })).rejects.toThrow("Asaas timed out");

    const reservation = mocks.save.mock.calls.find(([, , patch]) => {
      const reference: unknown = Reflect.get(Object(patch), "pendingReference");
      return typeof reference === "string" && reference.startsWith("creating:");
    });
    expect(reservation).toBeDefined();
    const pendingReference: unknown = Reflect.get(Object(reservation?.[2]), "pendingReference");
    mocks.account.mockResolvedValue(
      liveAccount({ status: "incomplete", subscriptionId: null, pendingReference }),
    );

    await expect(startSubscription({ ...input, method: "pix" })).rejects.toThrow(
      "ainda não confirmou",
    );
    expect(mocks.client.createPixSubscription).toHaveBeenCalledTimes(1);
  });

  it("refuses to charge an account whose plan is a courtesy in force", async () => {
    mocks.courtesy.mockResolvedValue({ plan: "elite", expiresAt: null });

    const attempt = startSubscription({ ...input, method: "pix" });

    await expect(attempt).rejects.toThrow("plano por cortesia");
    expect(mocks.client.createPixSubscription).not.toHaveBeenCalled();
    expect(mocks.client.createRecurringCheckout).not.toHaveBeenCalled();
  });

  it("lets an account subscribe once its courtesy is over", async () => {
    mocks.courtesy.mockResolvedValue({
      plan: "elite",
      expiresAt: new Date("2020-01-01T03:00:00Z"),
    });

    await startSubscription({ ...input, method: "pix" });

    expect(mocks.client.createPixSubscription).toHaveBeenCalledTimes(1);
  });

  it("denies non-owners before contacting the payment provider", async () => {
    mocks.owner.mockRejectedValue(forbiddenError());

    await expect(startSubscription({ ...input, method: "pix" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.client.createSubscriber).not.toHaveBeenCalled();
    expect(mocks.client.createPixSubscription).not.toHaveBeenCalled();
  });

  it("opens a Pix subscription at the plan price for the tenant's customer", async () => {
    const result = await startSubscription({ ...input, method: "pix" });

    expect(mocks.client.createSubscriber).toHaveBeenCalledWith(
      expect.objectContaining({ cpfCnpj: "24971563792", externalReference: "tenant-a" }),
    );
    expect(mocks.client.createPixSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_a",
        valueCents: 19_700,
        externalReference: expect.stringMatching(/^tenant-a:[a-f0-9-]+$/),
      }),
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-a",
      expect.objectContaining({ subscriptionId: "sub_new", plan: "pro", status: "incomplete" }),
    );
    expect(result).toEqual({ url: "https://asaas.test/i/1" });
  });

  it("sets up the service invoice of a new Pix subscription for its plan", async () => {
    await startSubscription({ ...input, method: "pix" });

    expect(mocks.enableInvoices).toHaveBeenCalledWith(mocks.client, {
      tenantId: "tenant-a",
      subscriptionId: "sub_new",
      customerId: "cus_a",
      planId: "pro",
    });
  });

  it("reuses the customer already bound to the tenant", async () => {
    mocks.account.mockResolvedValue(
      liveAccount({ status: "canceled", subscriptionId: null, periodEnd: null }),
    );

    await startSubscription({ ...input, method: "pix" });

    expect(mocks.client.createSubscriber).not.toHaveBeenCalled();
    expect(mocks.client.createPixSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cus_a" }),
    );
  });

  describe("after cancelling a paid month", () => {
    const today = asaasDueDate(new Date(), 0);

    it.each(["active", "past_due"])(
      "charges a dearer plan by Pix today, keeping the %s Start month until that Pix is paid",
      async (status) => {
        mocks.account.mockResolvedValue(cancelledStart(status));

        await startSubscription({ ...input, plan: "elite", method: "pix" });

        expect(mocks.client.createPixSubscription).toHaveBeenCalledWith(
          expect.objectContaining({ valueCents: 99_700, firstDueDate: today }),
        );
        expect(mocks.save).toHaveBeenLastCalledWith(expect.anything(), "tenant-a", {
          pendingPlan: "elite",
          pendingReference: "subscription:sub_new",
        });
        expect(mocks.save).not.toHaveBeenCalledWith(
          expect.anything(),
          "tenant-a",
          expect.objectContaining({ plan: "elite" }),
        );
      },
    );

    it("goes back to the same plan after an abandoned dearer Pix without charging again", async () => {
      const account = {
        ...cancelledStart("active"),
        pendingPlan: "elite",
        pendingReference: "subscription:sub_waiting",
      };
      mocks.account.mockResolvedValue(account);

      await startSubscription({ ...input, plan: "start", method: "pix" });

      expect(mocks.client.deleteSubscription).toHaveBeenCalledWith("sub_waiting");
      expect(mocks.client.createPixSubscription).not.toHaveBeenCalledWith(
        expect.objectContaining({ firstDueDate: today }),
      );
      expect(mocks.save).toHaveBeenCalledWith(
        expect.anything(),
        "tenant-a",
        expect.objectContaining({ plan: "start", prepaidUntil: account.periodEnd }),
      );
    });

    it("sends the reseller back to the first Pix of the dearer plan still waiting", async () => {
      mocks.account.mockResolvedValue({
        ...cancelledStart("active"),
        pendingPlan: "elite",
        pendingReference: "subscription:sub_waiting",
      });

      const result = await openPendingPayment({ tenantId: "tenant-a", userId: "owner-a" });

      expect(mocks.client.listSubscriptionCharges).toHaveBeenCalledWith("sub_waiting");
      expect(result).toEqual({ url: OPEN_PIX.invoiceUrl });
    });

    it("charges a dearer plan by card today", async () => {
      mocks.account.mockResolvedValue(cancelledStart("active"));

      await startSubscription({ ...input, plan: "elite", method: "credit_card" });

      expect(mocks.client.createRecurringCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ valueCents: 99_700, firstDueDate: today }),
      );
    });

    it("lets the same plan start charging when the paid month ends", async () => {
      const account = cancelledStart("active");
      mocks.account.mockResolvedValue(account);

      await startSubscription({ ...input, plan: "start", method: "pix" });

      expect(mocks.client.createPixSubscription).not.toHaveBeenCalledWith(
        expect.objectContaining({ firstDueDate: today }),
      );
      expect(mocks.save).toHaveBeenCalledWith(
        expect.anything(),
        "tenant-a",
        expect.objectContaining({ plan: "start", prepaidUntil: account.periodEnd }),
      );
    });
  });

  it("refuses to sell a second subscription to an account with a live one", async () => {
    mocks.account.mockResolvedValue(liveAccount());

    await expect(startSubscription({ ...input, method: "pix" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mocks.client.createPixSubscription).not.toHaveBeenCalled();
  });

  it("closes an unpaid card checkout before opening another", async () => {
    mocks.account.mockResolvedValue(
      liveAccount({
        status: "canceled",
        subscriptionId: null,
        pendingReference: "checkout:chk_old",
      }),
    );

    await startSubscription({ ...input, method: "credit_card" });

    expect(mocks.client.cancelCheckout).toHaveBeenCalledWith("chk_old");
    expect(mocks.client.cancelCheckout.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.client.createRecurringCheckout.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("keeps the card checkout waiting on the chosen plan", async () => {
    const result = await startSubscription({ ...input, method: "credit_card" });

    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), "tenant-a", {
      pendingPlan: "pro",
      pendingReference: "checkout:chk_1",
    });
    expect(result).toEqual({ url: "https://asaas.test/c/1" });
  });

  it("opens the card checkout empty when Asaas refuses the filled-in payer", async () => {
    mocks.holder.mockResolvedValue({
      ...HOLDER,
      phone: "11991234567",
      address: {
        street: "Avenida Paulista",
        number: "1000",
        complement: "",
        neighborhood: "Bela Vista",
        city: "São Paulo",
        state: "SP",
        cep: "01310100",
      },
    });
    mocks.client.createRecurringCheckout
      .mockRejectedValueOnce(new AsaasError("refused", { status: 400 }))
      .mockResolvedValueOnce({ checkoutId: "chk_2", url: "https://asaas.test/c/2" });

    const result = await startSubscription({ ...input, method: "credit_card" });

    expect(mocks.client.createRecurringCheckout).toHaveBeenLastCalledWith(
      expect.objectContaining({ payer: null }),
    );
    expect(result).toEqual({ url: "https://asaas.test/c/2" });
  });

  it("asks for the billing details before subscribing without a CPF", async () => {
    mocks.holder.mockResolvedValue(null);

    await expect(startSubscription({ ...input, method: "pix" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  // Regression (item 16.a, N5): a subscription change must never hold the organization row.
  it("refuses a second change while one is running, without touching Asaas", async () => {
    mocks.tryLock.mockResolvedValue(false);

    await expect(startSubscription({ ...input, method: "pix" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mocks.tryLock).toHaveBeenCalledWith({}, "tenant-a");
    expect(mocks.client.createPixSubscription).not.toHaveBeenCalled();
  });

  it("tells the reseller to try again when Asaas cannot be reached", async () => {
    mocks.client.createPixSubscription.mockRejectedValue(new AsaasError("down", { status: null }));

    await expect(startSubscription({ ...input, method: "pix" })).rejects.toMatchObject({
      code: "EXTERNAL_PROVIDER",
    });
  });
});

describe("plan change", () => {
  const paidThisMonth = {
    id: "pay_paid",
    status: "RECEIVED",
    value: 197,
    dueDate: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()),
  };

  beforeEach(() => {
    mocks.account.mockResolvedValue(liveAccount());
    mocks.client.getSubscription.mockResolvedValue({ ...PIX_SUBSCRIPTION, id: "sub_live" });
    mocks.client.listSubscriptionCharges.mockResolvedValue([paidThisMonth]);
    mocks.client.createOneOffCharge.mockResolvedValue({
      id: "pay_diff",
      status: "PENDING",
      value: 800,
      dueDate: paidThisMonth.dueDate,
      invoiceUrl: "https://asaas.test/i/diff",
    });
  });

  it("charges the difference before moving up and leaves the plan until it is paid", async () => {
    const result = await changePlan({ ...input, plan: "elite" });

    expect(mocks.client.createOneOffCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_a",
        billingType: "PIX",
        externalReference: expect.stringMatching(/^upgrade:tenant-a:[a-f0-9-]+:\d{13}$/),
      }),
    );
    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), "tenant-a", {
      pendingPlan: "elite",
      pendingReference: "charge:pay_diff",
    });
    expect(mocks.client.changeSubscriptionValue).not.toHaveBeenCalled();
    expect(result).toEqual({ url: "https://asaas.test/i/diff" });
  });

  it("sends the difference without the return when Asaas refuses the return address", async () => {
    mocks.client.createOneOffCharge
      .mockRejectedValueOnce(new AsaasError("no site", { status: 400 }))
      .mockResolvedValueOnce({
        id: "pay_diff",
        status: "PENDING",
        value: 800,
        dueDate: paidThisMonth.dueDate,
        invoiceUrl: "https://asaas.test/i/diff",
      });

    const result = await changePlan({ ...input, plan: "elite" });

    expect(mocks.client.createOneOffCharge).toHaveBeenLastCalledWith(
      expect.objectContaining({ successUrl: null }),
    );
    expect(result).toEqual({ url: "https://asaas.test/i/diff" });
  });

  it("schedules a smaller plan and charges its price from the next month", async () => {
    mocks.account.mockResolvedValue(liveAccount({ plan: "elite" }));

    const result = await changePlan({ ...input, plan: "start" });

    expect(mocks.client.changeSubscriptionValue).toHaveBeenCalledWith("sub_live", {
      valueCents: 9_700,
      description: "SellBridge Start",
    });
    expect(mocks.save).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-a",
      expect.objectContaining({ scheduledPlan: "start" }),
    );
    expect(result).toEqual({ url: null });
  });

  it("closes a card checkout priced for the old plan when moving up at once", async () => {
    mocks.account.mockResolvedValue(
      liveAccount({
        paymentMethod: "credit_card",
        pendingPlan: "pro",
        pendingReference: "checkout:chk_card",
      }),
    );
    mocks.planChangeOf.mockReturnValue({ kind: "upgrade_now" });

    await changePlan({ ...input, plan: "business" });

    expect(mocks.client.cancelCheckout).toHaveBeenCalledWith("chk_card");
    expect(mocks.save).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-a",
      expect.objectContaining({ plan: "business", pendingPlan: null, pendingReference: null }),
    );
  });

  it.each([
    ["scheduling a smaller plan", {}, "start"],
    [
      "undoing a scheduled smaller plan",
      { scheduledPlan: "start", scheduledPlanAt: new Date(Date.now() + 10 * 86_400_000) },
      "elite",
    ],
  ] as const)(
    "closes a card checkout priced for the old plan when %s",
    async (_label, overrides, target) => {
      mocks.account.mockResolvedValue(
        liveAccount({
          plan: "elite",
          paymentMethod: "credit_card",
          pendingPlan: "elite",
          pendingReference: "checkout:chk_card",
          ...overrides,
        }),
      );

      await changePlan({ ...input, plan: target });

      expect(mocks.client.cancelCheckout).toHaveBeenCalledWith("chk_card");
      expect(mocks.save).toHaveBeenCalledWith(
        expect.anything(),
        "tenant-a",
        expect.objectContaining({ pendingPlan: null, pendingReference: null }),
      );
    },
  );

  it("refuses a change while a monthly charge is late", async () => {
    mocks.account.mockResolvedValue(liveAccount({ status: "past_due" }));

    await expect(changePlan({ ...input, plan: "elite" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mocks.client.createOneOffCharge).not.toHaveBeenCalled();
  });
});

describe("paying what is open", () => {
  it("closes a difference whose month is over and offers the monthly fee instead", async () => {
    mocks.account.mockResolvedValue(
      liveAccount({ pendingPlan: "elite", pendingReference: "charge:pay_diff" }),
    );
    mocks.client.getCharge.mockResolvedValue({
      id: "pay_diff",
      status: "OVERDUE",
      value: 50,
      dueDate: "2025-12-04",
      invoiceUrl: "https://asaas.test/i/diff",
      externalReference: "upgrade:tenant-a:ref:1766199600000",
    });
    mocks.client.getSubscription.mockResolvedValue({ ...PIX_SUBSCRIPTION, id: "sub_live" });
    mocks.client.listSubscriptionCharges.mockResolvedValue([OPEN_PIX]);

    const result = await openPendingPayment({ tenantId: "tenant-a", userId: "owner-a" });

    expect(mocks.client.deleteCharge).toHaveBeenCalledWith("pay_diff");
    expect(mocks.settle).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "tenant-a",
      reference: "charge:pay_diff",
    });
    expect(result).toEqual({ url: OPEN_PIX.invoiceUrl });
  });

  it("never sends the reseller to an upgrade difference the card already paid", async () => {
    mocks.account.mockResolvedValue(liveAccount({ pendingReference: "charge:pay_diff" }));
    mocks.client.getCharge.mockResolvedValue({
      id: "pay_diff",
      status: "CONFIRMED",
      value: 50,
      dueDate: "2026-11-19",
      invoiceUrl: "https://asaas.test/i/diff",
    });
    mocks.client.getSubscription.mockResolvedValue(PIX_SUBSCRIPTION);
    mocks.client.listSubscriptionCharges.mockResolvedValue([]);

    await expect(openPendingPayment({ tenantId: "tenant-a", userId: "owner-a" })).rejects.toThrow(
      "Não há pagamento em aberto agora.",
    );
  });
});
