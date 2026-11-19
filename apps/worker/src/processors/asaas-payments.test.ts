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
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findSupplierPaymentAccount: mocks.findAccount,
  listHeldPayments: mocks.listHeld,
  listShipmentPaymentsToReconcile: mocks.listOpen,
  markShipmentPaymentChecked: mocks.markChecked,
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
});
