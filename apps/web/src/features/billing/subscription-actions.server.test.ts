import { beforeEach, describe, expect, it, vi } from "vitest";
import { forbiddenError } from "@sellbridge/shared/errors";

const mocks = vi.hoisted(() => ({
  owner: vi.fn<(...input: unknown[]) => Promise<void>>(),
  account: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  save: vi.fn<(...input: unknown[]) => Promise<void>>(),
  tryLock: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
  holder: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  email: vi.fn<(...input: unknown[]) => Promise<string | null>>(),
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
  },
}));
vi.mock("@sellbridge/database/repositories", () => ({
  requireBillingOwner: mocks.owner,
  getBillingAccount: mocks.account,
  saveBillingAccount: mocks.save,
  tryLockBillingCheckout: mocks.tryLock,
  findBillingHolder: mocks.holder,
  findBillingOwnerEmail: mocks.email,
  applyBillingState: vi.fn<() => Promise<boolean>>(),
  findBillingAccountByPendingReference: vi.fn<() => Promise<unknown>>(),
  findBillingAccountBySubscription: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/lib/server/environment", () => ({
  environment: { APP_URL: "https://sellbridge.test", BILLING_PAST_DUE_GRACE_DAYS: 7 },
}));
vi.mock("@/lib/server/database", () => ({
  database: {
    transaction: async (operation: (executor: object) => Promise<unknown>) => operation({}),
  },
}));
vi.mock("./billing-config.server", () => ({ billingClient: () => mocks.client }));

import { AsaasError } from "@sellbridge/payments/asaas";
import { cancelSubscription, changePlan, startSubscription } from "./subscription-actions.server";

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue();
  mocks.tryLock.mockResolvedValue(true);
  mocks.account.mockResolvedValue(null);
  mocks.holder.mockResolvedValue(HOLDER);
  mocks.email.mockResolvedValue("dono@example.com");
  mocks.client.findSubscriber.mockResolvedValue(null);
  mocks.client.createSubscriber.mockResolvedValue("cus_a");
  mocks.client.createPixSubscription.mockResolvedValue(PIX_SUBSCRIPTION);
  mocks.client.listSubscriptionCharges.mockResolvedValue([OPEN_PIX]);
  mocks.client.createRecurringCheckout.mockResolvedValue({
    checkoutId: "chk_1",
    url: "https://asaas.test/c/1",
  });
});

describe("first subscription", () => {
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
        externalReference: "tenant-a",
      }),
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-a",
      expect.objectContaining({ subscriptionId: "sub_new", plan: "pro", status: "incomplete" }),
    );
    expect(result).toEqual({ url: "https://asaas.test/i/1" });
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
        externalReference: "upgrade:tenant-a",
      }),
    );
    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), "tenant-a", {
      pendingPlan: "elite",
      pendingReference: "charge:pay_diff",
    });
    expect(mocks.client.changeSubscriptionValue).not.toHaveBeenCalled();
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

  it("refuses a change while a monthly charge is late", async () => {
    mocks.account.mockResolvedValue(liveAccount({ status: "past_due" }));

    await expect(changePlan({ ...input, plan: "elite" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mocks.client.createOneOffCharge).not.toHaveBeenCalled();
  });
});

describe("cancellation", () => {
  it("ends the subscription at Asaas and keeps the month already paid", async () => {
    const periodEnd = new Date(Date.now() + 10 * 86_400_000);
    mocks.account.mockResolvedValue(liveAccount({ periodEnd }));

    const result = await cancelSubscription(input);

    expect(mocks.client.deleteSubscription).toHaveBeenCalledWith("sub_live");
    expect(mocks.save).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-a",
      expect.not.objectContaining({ status: expect.anything() }),
    );
    expect(result).toEqual({ endsAt: periodEnd.toISOString() });
  });
});
