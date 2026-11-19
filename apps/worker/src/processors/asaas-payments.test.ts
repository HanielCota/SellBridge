import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAccount: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  listHeld: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
  listOpen: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
  markChecked: vi.fn<(...input: unknown[]) => Promise<void>>(),
  reconcile: vi.fn<(...input: unknown[]) => Promise<void>>(),
  settle: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  sync: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  reportWithoutAccount: vi.fn<(...input: unknown[]) => void>(),
  markDeferred: vi.fn<(...input: unknown[]) => Promise<Date>>(),
  clearDeferral: vi.fn<(...input: unknown[]) => Promise<void>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findSupplierPaymentAccount: mocks.findAccount,
  listHeldPayments: mocks.listHeld,
  listShipmentPaymentsToReconcile: mocks.listOpen,
  markShipmentPaymentChecked: mocks.markChecked,
  markShipmentPaymentDeferred: mocks.markDeferred,
  clearShipmentPaymentDeferral: mocks.clearDeferral,
  listShipmentPaymentRefundCandidates: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
}));
vi.mock("@sellbridge/payments/asaas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sellbridge/payments/asaas")>()),
  reconcileAsaasParcel: mocks.reconcile,
  settleHeldPayment: mocks.settle,
  syncAsaasCharge: mocks.sync,
  reportHeldWithoutAccount: mocks.reportWithoutAccount,
}));

import { createDatabase } from "@sellbridge/database/client";
import { AsaasError } from "@sellbridge/payments/asaas";
import { problemsLoggedBy } from "@sellbridge/shared/problem-capture-testing";
import { createAsaasPaymentProcessor } from "./asaas-payments.ts";

// Never connected: every database call in these tests is a mock.
const database = createDatabase("postgres://unused:unused@localhost:1/unused");
const cipher = { encrypt: (value: string) => value, decrypt: (value: string) => value };
const settings = {
  apiUrl: "https://asaas.test/v3",
  apiKey: "platform-key",
  walletId: "wallet_sellbridge",
  webhookToken: "t".repeat(40),
};
const NOW = new Date("2026-12-10T12:00:00Z");
const account = { id: "account-1", supplierId: "supplier-1", status: "connected" };

function heldPayment(id: string, status = "approved") {
  return {
    payment: { id, supplierId: "supplier-1", providerPaymentId: `pay_${id}`, status },
    tenantId: "tenant-1",
    orderId: "order-1",
    shipmentStatus: "delivered",
    deliveredAt: new Date("2026-12-01T12:00:00Z"),
    hasOpenReturnClaim: false,
    cancelledByResellerAfterAccept: false,
  };
}

function processor(withSettings = true) {
  return createAsaasPaymentProcessor({
    database,
    cipher,
    settings: withSettings ? settings : null,
    now: () => NOW,
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  mocks.findAccount.mockResolvedValue(account);
  mocks.listOpen.mockResolvedValue([]);
  mocks.listHeld.mockResolvedValue([]);
  mocks.markDeferred.mockResolvedValue(NOW);
});

describe("createAsaasPaymentProcessor", () => {
  it("does nothing while protected payments are off", async () => {
    const round = await processor(false)();

    expect(round).toEqual({ checked: 0, held: 0, released: 0, refundsRequested: 0 });
    expect(mocks.listOpen).not.toHaveBeenCalled();
  });

  it("reads back the open Asaas payments only", async () => {
    mocks.listOpen.mockResolvedValue([{ id: "payment-1", supplierId: "supplier-1" }]);

    await processor()();

    expect(mocks.listOpen).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ provider: "asaas" }),
    );
    expect(mocks.reconcile).toHaveBeenCalledOnce();
  });

  it("settles each held payment with its charge read back first", async () => {
    const held = heldPayment("payment-1");
    mocks.listHeld.mockResolvedValue([held]);
    mocks.sync.mockResolvedValue({
      kind: "applied",
      payment: held.payment,
      charge: { refundInProgress: false },
    });
    mocks.settle.mockResolvedValue({ kind: "released" });

    const round = await processor()();

    expect(mocks.sync).toHaveBeenCalledWith(expect.anything(), {
      account,
      chargeId: "pay_payment-1",
    });
    expect(mocks.settle).toHaveBeenCalledWith(expect.anything(), { account, held, now: NOW });
    expect(round.released).toBe(1);
  });

  it("leaves alone a payment Asaas already refunded", async () => {
    const held = heldPayment("payment-1");
    mocks.listHeld.mockResolvedValue([held]);
    mocks.sync.mockResolvedValue({
      kind: "applied",
      payment: { ...held.payment, status: "refunded" },
      charge: { refundInProgress: false },
    });

    await processor()();

    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("does not ask for a refund again while Asaas is still making the first one", async () => {
    const held = heldPayment("payment-1");
    mocks.listHeld.mockResolvedValue([held]);
    mocks.sync.mockResolvedValue({
      kind: "applied",
      payment: held.payment,
      charge: { refundInProgress: true },
    });

    await processor()();

    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("goes on with the other payments when Asaas fails on one", async () => {
    mocks.listHeld.mockResolvedValue([heldPayment("payment-1"), heldPayment("payment-2")]);
    mocks.sync
      .mockRejectedValueOnce(new AsaasError("Asaas answered 503", { status: 503 }))
      .mockResolvedValueOnce({ kind: "ignored", reason: "unchanged" });
    mocks.settle.mockResolvedValue({ kind: "refund_requested", reason: "cancelled" });

    const round = await processor()();

    expect(mocks.settle).toHaveBeenCalledOnce();
    expect(round).toMatchObject({ held: 2, refundsRequested: 1 });
  });

  it("hands the team the held money of a supplier whose Asaas account is out of service", async () => {
    mocks.findAccount.mockResolvedValue({ ...account, status: "error" });
    const held = heldPayment("payment-1");
    mocks.listHeld.mockResolvedValue([held]);

    await processor()();

    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.markChecked).toHaveBeenCalledOnce();
    expect(mocks.reportWithoutAccount).toHaveBeenCalledWith(held, NOW);
  });

  it("tells the team once Asaas has kept payments waiting for more than two hours", async () => {
    mocks.listOpen.mockResolvedValue([{ id: "payment-1", supplierId: "supplier-1" }]);
    mocks.reconcile.mockRejectedValue(new AsaasError("Asaas answered 503", { status: 503 }));
    mocks.markDeferred.mockResolvedValue(new Date(NOW.getTime() - 3 * 60 * 60 * 1000));

    const problems = await problemsLoggedBy(processor());

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      event: "payments.provider_stuck",
      area: "payments",
      message: expect.stringContaining("Asaas sem responder há mais de 2 horas: 1 pagamento"),
    });
  });

  // Regression: the charge read cleared the wait before the release ran, so a release or refund
  // that Asaas kept refusing restarted the clock every round and never reached Problemas.
  it("keeps counting the wait while Asaas reads the charge but refuses the release", async () => {
    const held = heldPayment("payment-1");
    mocks.listHeld.mockResolvedValue([held]);
    mocks.sync.mockResolvedValue({
      kind: "applied",
      payment: held.payment,
      charge: { refundInProgress: false },
    });
    mocks.settle.mockRejectedValue(new AsaasError("Asaas answered 503", { status: 503 }));
    mocks.markDeferred.mockResolvedValue(new Date(NOW.getTime() - 3 * 60 * 60 * 1000));

    const problems = await problemsLoggedBy(processor());

    expect(mocks.clearDeferral).not.toHaveBeenCalled();
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ event: "payments.provider_stuck" });
  });

  it("keeps a short Asaas outage off Problemas and forgets it once Asaas answers", async () => {
    mocks.listOpen.mockResolvedValue([{ id: "payment-1", supplierId: "supplier-1" }]);
    mocks.reconcile.mockRejectedValueOnce(new AsaasError("Asaas answered 503", { status: 503 }));
    mocks.markDeferred.mockResolvedValue(new Date(NOW.getTime() - 10 * 60 * 1000));

    const outage = await problemsLoggedBy(processor());
    await processor()();

    expect(outage).toEqual([]);
    expect(mocks.clearDeferral).toHaveBeenCalledWith(database, "payment-1");
  });
});
