import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPayable: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  findAccount: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  getFee: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  start: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  findPayment: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  save: vi.fn<(...input: unknown[]) => Promise<void>>(),
  release: vi.fn<(...input: unknown[]) => Promise<void>>(),
  reconcile: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  createCheckout: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findPayableShipment: mocks.findPayable,
  findSupplierPaymentAccount: mocks.findAccount,
  getPaymentFeeSetting: mocks.getFee,
  startShipmentPayment: mocks.start,
  findShipmentPayment: mocks.findPayment,
  savePaymentPreference: mocks.save,
  releaseShipmentPaymentReservation: mocks.release,
  openCheckoutUrl: (payment: { checkoutUrl: string | null; checkoutExpiresAt: Date | null }) =>
    payment.checkoutExpiresAt !== null && payment.checkoutExpiresAt > new Date()
      ? payment.checkoutUrl
      : null,
}));
vi.mock("@sellbridge/payments/mercado-pago", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sellbridge/payments/mercado-pago")>()),
  reconcileShipmentPayment: mocks.reconcile,
  createMercadoPagoCheckout: mocks.createCheckout,
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
  },
}));

import { MercadoPagoError } from "@sellbridge/payments/mercado-pago";
import { startSupplierCheckout } from "./supplier-payments.server";

const SHIPMENT_ID = "6a1f4d7e-9a43-4b2d-8c3e-4f505f0c9a3e";
/** The parcel's first checkout closed half an hour ago without a payment SellBridge heard of. */
const earlierPayment = {
  id: "0b8f7a6e-1c2d-4e3f-8a9b-7c6d5e4f3a21",
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
const request = { tenantId: "tenant-1", shipmentId: SHIPMENT_ID, impersonatedBy: null };

beforeEach(() => {
  mocks.findPayable.mockResolvedValue(payable);
  mocks.findAccount.mockResolvedValue(account);
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
