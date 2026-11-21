import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPayable: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  findAccount: vi.fn<(database: unknown, query: { provider: string }) => Promise<unknown>>(),
  getFee: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  start: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  findPayment: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  save: vi.fn<(...input: unknown[]) => Promise<void>>(),
  release: vi.fn<(...input: unknown[]) => Promise<void>>(),
  reopen: vi.fn<(...input: unknown[]) => Promise<void>>(),
  reconcile: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  createCheckout: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  findChoice: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  leaveAsaasCharges: vi.fn<(...input: unknown[]) => Promise<void>>(),
  openAsaasCheckout: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findPayableShipment: mocks.findPayable,
  findSupplierPaymentAccount: mocks.findAccount,
  getPaymentFeeSetting: mocks.getFee,
  startShipmentPayment: mocks.start,
  findShipmentPayment: mocks.findPayment,
  savePaymentPreference: mocks.save,
  releaseShipmentPaymentReservation: mocks.release,
  reopenShipmentCheckout: mocks.reopen,
  findSupplierPaymentChoice: mocks.findChoice,
  findPreparationHold: async () => null,
  findOpenSupportTicketForOrder: async () => null,
  getNewSupplierRule: async () => ({ enabled: false, deliveries: 5 }),
  countConfirmedDeliveries: async () => 0,
  openCheckoutUrl: (
    payment: { checkoutUrl: string | null; checkoutExpiresAt: Date | null } | null,
  ) =>
    payment !== null && payment.checkoutExpiresAt !== null && payment.checkoutExpiresAt > new Date()
      ? payment.checkoutUrl
      : null,
}));
vi.mock("@sellbridge/payments/mercado-pago", async (importOriginal) => {
  const original = await importOriginal<typeof import("@sellbridge/payments/mercado-pago")>();
  return {
    ...original,
    // The hidden Mercado Pago code is tested switched on; the app keeps it off.
    mercadoPagoSettingsFrom: (
      environment: Parameters<typeof original.mercadoPagoSettingsFrom>[0],
    ) => original.mercadoPagoSettingsFrom(environment, true),
    reconcileShipmentPayment: mocks.reconcile,
    createMercadoPagoCheckout: mocks.createCheckout,
  };
});
vi.mock("./asaas-checkout.server", () => ({
  leaveAsaasCharges: mocks.leaveAsaasCharges,
  openAsaasCheckout: mocks.openAsaasCheckout,
  refreshAsaasParcel: vi.fn<(...input: unknown[]) => Promise<void>>(),
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/marketplaces", () => ({
  tokenCipher: { encrypt: (value: string) => value, decrypt: (value: string) => value },
}));
vi.mock("@/lib/server/environment", () => ({
  environment: {
    APP_URL: "http://localhost:3510",
    MERCADO_PAGO_CLIENT_ID: "client",
    MERCADO_PAGO_CLIENT_SECRET: "secret",
    MERCADO_PAGO_WEBHOOK_SECRET: "signature-secret",
    MERCADO_PAGO_TEST_MODE: false,
    MERCADO_PAGO_API_URL: "https://api.mercadopago.test",
    MERCADO_PAGO_AUTH_URL: "https://auth.mercadopago.test",
    ASAAS_API_URL: "https://asaas.test/v3",
    ASAAS_API_KEY: "platform-key",
    ASAAS_WALLET_ID: "wallet_sellbridge",
    ASAAS_WEBHOOK_TOKEN: "t".repeat(40),
  },
}));

import { MercadoPagoError } from "@sellbridge/payments/mercado-pago";
import { loadResellerSupplierPayment, startSupplierCheckout } from "./supplier-payments.server";
import { showsProtectionSeal } from "./protection-seal";

const SHIPMENT_ID = "6a1f4d7e-9a43-4b2d-8c3e-4f505f0c9a3e";
/** The parcel's first checkout closed half an hour ago without a payment SellBridge heard of. */
const earlierPayment = {
  id: "0b8f7a6e-1c2d-4e3f-8a9b-7c6d5e4f3a21",
  provider: "mercado_pago",
  preferenceId: "first",
  status: "pending",
  checkoutUrl: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=first",
  checkoutExpiresAt: new Date(Date.now() - 60_000),
  amountCents: 5990,
  platformFeeCents: 60,
};
const payable = {
  shipmentId: SHIPMENT_ID,
  orderId: "order-1",
  externalOrderId: "2000001",
  supplierId: "supplier-1",
  supplierName: "Fornecedor",
  catalogKind: "supplier",
  status: "forwarded",
  cancelledByResellerAfterAccept: false,
  amountCents: 5990,
  payment: earlierPayment,
};
const account = {
  id: "account-1",
  supplierId: "supplier-1",
  status: "connected",
  accessTokenEnc: "seller-token",
  refreshTokenEnc: "refresh",
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
};
const asaasAccount = {
  ...account,
  id: "account-asaas",
  provider: "asaas",
  accessTokenEnc: "asaas-key",
  walletId: "wallet_supplier",
  reviewStatus: "approved",
  lastError: null,
};
const request = {
  tenantId: "tenant-1",
  shipmentId: SHIPMENT_ID,
  payMethod: "PIX" as const,
  impersonatedBy: null,
};
const ASAAS_CHECKOUT = "https://asaas.test/i/1";

beforeEach(() => {
  mocks.findPayable.mockResolvedValue(payable);
  mocks.findAccount.mockImplementation(async (_database, query) =>
    query.provider === "asaas" ? asaasAccount : account,
  );
  mocks.findChoice.mockResolvedValue(null);
  mocks.openAsaasCheckout.mockResolvedValue({ checkoutUrl: ASAAS_CHECKOUT });
  mocks.getFee.mockResolvedValue({ basisPoints: 100 });
  mocks.start.mockResolvedValue({ ...earlierPayment, checkoutExpiresAt: null });
  mocks.createCheckout.mockResolvedValue({
    preferenceId: "pref-second",
    checkoutUrl: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=second",
  });
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("startSupplierCheckout", () => {
  it("does not open a new checkout while a payment of the earlier one is under review", async () => {
    mocks.reconcile.mockResolvedValue({ ...earlierPayment, status: "in_process" });

    await expect(startSupplierCheckout(request)).rejects.toThrow("em análise");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("tells the reseller the parcel is paid when the earlier checkout's payment was approved", async () => {
    mocks.reconcile.mockResolvedValue({ ...earlierPayment, status: "approved" });

    await expect(startSupplierCheckout(request)).rejects.toThrow("Este envio já foi pago");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("opens no checkout when Mercado Pago cannot say how the earlier one went", async () => {
    mocks.reconcile.mockRejectedValue(new MercadoPagoError("Mercado Pago answered 503", 503));

    await expect(startSupplierCheckout(request)).rejects.toThrow(
      "Não conseguimos conferir com o Mercado Pago",
    );
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("opens a new checkout once the earlier payment was rejected", async () => {
    mocks.reconcile.mockResolvedValue({ ...earlierPayment, status: "rejected" });

    const result = await startSupplierCheckout(request);

    expect(result.checkoutUrl).toContain("pref_id=second");
    expect(mocks.save).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ preferenceId: "pref-second" }),
    );
  });
});

describe("startSupplierCheckout across providers", () => {
  it("keeps an open Mercado Pago checkout after the supplier chose Asaas", async () => {
    mocks.findChoice.mockResolvedValue("asaas");
    const openCheckout = { ...earlierPayment, checkoutExpiresAt: new Date(Date.now() + 60_000) };
    mocks.findPayable.mockResolvedValue({ ...payable, payment: openCheckout });

    const result = await startSupplierCheckout(request);

    expect(result.checkoutUrl).toBe(earlierPayment.checkoutUrl);
    expect(mocks.openAsaasCheckout).not.toHaveBeenCalled();
  });

  it("charges a parcel never paid through Asaas once the supplier chose it", async () => {
    mocks.findChoice.mockResolvedValue("asaas");
    mocks.findPayable.mockResolvedValue({ ...payable, payment: null });

    const result = await startSupplierCheckout(request);

    expect(result.checkoutUrl).toBe(ASAAS_CHECKOUT);
    expect(mocks.start).toHaveBeenCalledWith({}, expect.objectContaining({ provider: "asaas" }));
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("closes the parcel's Asaas charges before charging it on Mercado Pago", async () => {
    const asaasAttempt = { ...earlierPayment, provider: "asaas", preferenceId: "pay_1" };
    mocks.findPayable.mockResolvedValue({ ...payable, payment: asaasAttempt });

    const result = await startSupplierCheckout(request);

    expect(mocks.leaveAsaasCharges).toHaveBeenCalledWith({
      account: asaasAccount,
      payment: asaasAttempt,
    });
    expect(result.checkoutUrl).toContain("pref_id=second");
  });

  it("says an Asaas payment that got there first is protected, not with the supplier", async () => {
    mocks.findChoice.mockResolvedValue("asaas");
    mocks.findPayable.mockResolvedValue({ ...payable, payment: null });
    // Another tab reserved and paid the parcel between the screen and this click.
    mocks.start.mockResolvedValue(null);
    mocks.findPayment.mockResolvedValue({
      ...earlierPayment,
      provider: "asaas",
      status: "approved",
    });

    await expect(startSupplierCheckout(request)).rejects.toThrow(
      "Este envio já foi pago. O valor está protegido no Asaas.",
    );
  });

  it("asks Asaas only for the method the reseller picked", async () => {
    mocks.findChoice.mockResolvedValue("asaas");
    mocks.findPayable.mockResolvedValue({ ...payable, payment: null });

    await startSupplierCheckout({ ...request, payMethod: "CREDIT_CARD" });

    expect(mocks.openAsaasCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ payMethod: "CREDIT_CARD" }),
    );
  });

  it("looks an open Asaas charge up again so the reseller can pay another way", async () => {
    mocks.findChoice.mockResolvedValue("asaas");
    const openCharge = {
      ...earlierPayment,
      provider: "asaas",
      preferenceId: "pay_pix",
      checkoutUrl: "https://asaas.test/i/pix",
      checkoutExpiresAt: new Date(Date.now() + 60 * 60_000),
    };
    mocks.findPayable.mockResolvedValue({ ...payable, payment: openCharge });

    const result = await startSupplierCheckout({ ...request, payMethod: "CREDIT_CARD" });

    expect(mocks.reopen).toHaveBeenCalledWith(
      {},
      { paymentId: earlierPayment.id, preferenceId: "pay_pix" },
    );
    expect(mocks.openAsaasCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ payMethod: "CREDIT_CARD" }),
    );
    expect(result.checkoutUrl).toBe(ASAAS_CHECKOUT);
  });

  it("leaves the Asaas charges alone while the parcel is still paid through Asaas", async () => {
    mocks.findChoice.mockResolvedValue("asaas");
    const asaasAttempt = { ...earlierPayment, provider: "asaas", preferenceId: "pay_1" };
    mocks.findPayable.mockResolvedValue({ ...payable, payment: asaasAttempt });

    const result = await startSupplierCheckout(request);

    expect(mocks.leaveAsaasCharges).not.toHaveBeenCalled();
    expect(result.checkoutUrl).toBe(ASAAS_CHECKOUT);
  });
});

describe("loadResellerSupplierPayment, a refund Asaas refused", () => {
  const DAY = 24 * 60 * 60 * 1000;

  /** A Pix the team gives back by hand, its guarantee ending this many days from now. */
  function refusedRefund(daysToExpiry: number) {
    return {
      ...payable,
      status: "cancelled",
      payment: {
        ...earlierPayment,
        provider: "asaas",
        status: "approved",
        paidAt: new Date(Date.now() - 10 * DAY),
        paymentMethod: "PIX",
        refundReason: "cancelled",
        refundRequestedAt: new Date(),
        refundFailedAt: new Date(),
        escrowExpiresAt: new Date(Date.now() + daysToExpiry * DAY),
      },
    };
  }

  it("still counts the money as held before the guarantee ends", async () => {
    mocks.findPayable.mockResolvedValue(refusedRefund(5));

    const view = await loadResellerSupplierPayment({
      tenantId: "tenant-1",
      shipmentId: SHIPMENT_ID,
    });

    expect(view.manualRefund).toMatchObject({ releasedToSupplier: false, ticketId: null });
  });

  it("says Asaas released the money once the guarantee ended", async () => {
    mocks.findPayable.mockResolvedValue(refusedRefund(-1));

    const view = await loadResellerSupplierPayment({
      tenantId: "tenant-1",
      shipmentId: SHIPMENT_ID,
    });

    expect(view.manualRefund?.releasedToSupplier).toBe(true);
  });
});

/** Paid by Pix through Asaas, then cancelled; the refund round has not run yet. */
function cancelledPaidParcel(afterAccept: boolean, payment: Record<string, unknown> = {}) {
  return {
    ...payable,
    status: "cancelled",
    cancelledByResellerAfterAccept: afterAccept,
    payment: {
      ...earlierPayment,
      provider: "asaas",
      status: "approved",
      paidAt: new Date(),
      paymentMethod: "PIX",
      refundReason: null,
      refundRequestedAt: null,
      refundFailedAt: null,
      refundHeldAt: null,
      releasedAt: null,
      escrowStatus: null,
      teamDecision: null,
      ...payment,
    },
  };
}

describe("loadResellerSupplierPayment, a paid parcel the reseller cancelled", () => {
  it("shows the money on its way back instead of a paid supplier", async () => {
    mocks.findPayable.mockResolvedValue(cancelledPaidParcel(false));

    const view = await loadResellerSupplierPayment({
      tenantId: "tenant-1",
      shipmentId: SHIPMENT_ID,
    });

    expect(view.badge).toEqual({ kind: "refunding" });
    expect(view.refund).toEqual({ reason: "cancelled", failed: false });
    expect(view.paymentMethod).toBe("PIX");
  });

  it("says the team checks first when the supplier had already accepted", async () => {
    mocks.findPayable.mockResolvedValue(cancelledPaidParcel(true));

    const view = await loadResellerSupplierPayment({
      tenantId: "tenant-1",
      shipmentId: SHIPMENT_ID,
    });

    expect(view.badge).toEqual({ kind: "held" });
    expect(view.refund).toBeNull();
  });

  it("shows the supplier paid once the team released the money of a parcel cancelled after the accept", async () => {
    mocks.findPayable.mockResolvedValue(
      cancelledPaidParcel(true, {
        teamDecision: "release",
        releasedAt: new Date(),
        escrowStatus: "done",
      }),
    );

    const view = await loadResellerSupplierPayment({
      tenantId: "tenant-1",
      shipmentId: SHIPMENT_ID,
    });

    expect(view.badge.kind).toBe("paid");
    expect(showsProtectionSeal(view)).toBe(false);
  });

  it("shows the supplier paid once the Asaas guarantee ended on a cancelled parcel", async () => {
    mocks.findPayable.mockResolvedValue(cancelledPaidParcel(false, { escrowStatus: "done" }));

    const view = await loadResellerSupplierPayment({
      tenantId: "tenant-1",
      shipmentId: SHIPMENT_ID,
    });

    expect(view.badge.kind).toBe("paid");
    expect(showsProtectionSeal(view)).toBe(false);
  });

  it("promises back what was charged, not today's cost, while the team checks", async () => {
    mocks.findPayable.mockResolvedValue({
      ...cancelledPaidParcel(true, { amountCents: 4590 }),
      amountCents: 5990,
    });

    const view = await loadResellerSupplierPayment({
      tenantId: "tenant-1",
      shipmentId: SHIPMENT_ID,
    });

    expect(view.badge).toEqual({ kind: "held" });
    expect(view.amountCents).toBe(4590);
  });
});
