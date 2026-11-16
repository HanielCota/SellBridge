import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPayment: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  listCheckouts: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
  apply: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  markError: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
  rotate: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findShipmentPaymentById: mocks.findPayment,
  listShipmentPaymentCheckouts: mocks.listCheckouts,
  applyProviderPayment: mocks.apply,
  markSupplierPaymentAccountError: mocks.markError,
  rotatePaymentAccountTokens: mocks.rotate,
}));

import { createDatabase } from "@sellbridge/database/client";
import { logger } from "@sellbridge/shared/logger";
import type { ShipmentPayment, SupplierPaymentAccount } from "@sellbridge/database/repositories";
import type { MercadoPagoContext } from "./context.ts";
import { reconcileShipmentPayment } from "./payment-reconcile.ts";
import { syncMercadoPagoPayment } from "./payment-sync.ts";

const SUPPLIER_ID = "5f0c9a3e-6a1f-4d7e-9a43-8b2d1c3e4f50";
const PAYMENT_ROW_ID = "0b8f7a6e-1c2d-4e3f-8a9b-7c6d5e4f3a21";
const FIRST_CHECKOUT = { preferenceId: "pref-first", amountCents: 5990, platformFeeCents: 300 };
const LATEST_CHECKOUT = { preferenceId: "pref-latest", amountCents: 6100, platformFeeCents: 61 };

const context: MercadoPagoContext = {
  // Never connected: every database call in these tests is a mock.
  database: createDatabase("postgres://unused:unused@localhost:1/unused"),
  cipher: { encrypt: (value: string) => `enc:${value}`, decrypt: (value: string) => value },
  settings: {
    clientId: "client",
    clientSecret: "secret",
    webhookSecret: "signature",
    testMode: false,
    apiUrl: "https://api.mercadopago.test",
    authUrl: "https://auth.mercadopago.test",
  },
};

const account: SupplierPaymentAccount = {
  id: "account-1",
  supplierId: SUPPLIER_ID,
  provider: "mercado_pago",
  providerAccountId: "112233",
  status: "connected",
  accessTokenEnc: "seller-token",
  refreshTokenEnc: "refresh",
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  lastError: null,
  walletId: null,
  reviewStatus: null,
  connectedByUserId: null,
  connectedAt: new Date(),
  updatedAt: new Date(),
};

/** The parcel after the reseller opened a second checkout: the latest one's amount and fee. */
const parcel: ShipmentPayment = {
  id: PAYMENT_ROW_ID,
  shipmentId: "6a1f4d7e-9a43-4b2d-8c3e-4f505f0c9a3e",
  supplierId: SUPPLIER_ID,
  provider: "mercado_pago",
  status: "pending",
  amountCents: LATEST_CHECKOUT.amountCents,
  platformFeeCents: LATEST_CHECKOUT.platformFeeCents,
  platformFeeBasisPoints: 100,
  preferenceId: LATEST_CHECKOUT.preferenceId,
  checkoutUrl: null,
  checkoutExpiresAt: null,
  providerPaymentId: null,
  paymentMethod: null,
  paidAt: null,
  checkedAt: null,
  refundReason: null,
  refundRequestedAt: null,
  refundFailedAt: null,
  refundError: null,
  refundHeldAt: null,
  escrowId: null,
  escrowStatus: null,
  escrowExpiresAt: null,
  releaseRequestedAt: null,
  releasedAt: null,
  teamDecision: null,
  teamDecisionAt: null,
  teamDecisionByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function remotePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 987654321,
    status: "approved",
    external_reference: PAYMENT_ROW_ID,
    date_approved: "2026-11-15T14:32:00.000-03:00",
    transaction_amount: 59.9,
    payment_type_id: "credit_card",
    currency_id: "BRL",
    collector_id: 112233,
    fee_details: [{ type: "application_fee", amount: 3, fee_payer: "collector" }],
    ...overrides,
  };
}

const fetchMock = vi.fn<(...input: unknown[]) => Promise<Response>>();

/** Answers payment reads with `payment`, and each checkout's merchant orders with its payments. */
function mercadoPagoAnswers(
  payment: Record<string, unknown>,
  paymentsByPreference: Record<string, number[]>,
): void {
  fetchMock.mockImplementation(async (url: unknown) => {
    const address = new URL(String(url));
    if (address.pathname.endsWith("/merchant_orders/search")) {
      const preferenceId = address.searchParams.get("preference_id") ?? "";
      const ids = paymentsByPreference[preferenceId] ?? [];
      const elements = [{ preference_id: preferenceId, payments: ids.map((id) => ({ id })) }];
      return new Response(JSON.stringify({ elements }), { status: 200 });
    }
    return new Response(JSON.stringify(payment), { status: 200 });
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  mocks.findPayment.mockResolvedValue(parcel);
  mocks.listCheckouts.mockResolvedValue([LATEST_CHECKOUT, FIRST_CHECKOUT]);
  mocks.apply.mockResolvedValue({ kind: "applied", payment: { ...parcel, status: "approved" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe("syncMercadoPagoPayment", () => {
  test("settles the parcel with a late approval from a checkout opened before the latest one", async () => {
    mercadoPagoAnswers(remotePayment(), { "pref-first": [987654321], "pref-latest": [] });

    const result = await syncMercadoPagoPayment(context, {
      account,
      providerPaymentId: "987654321",
    });

    expect(result.kind).toBe("applied");
    expect(mocks.apply).toHaveBeenCalledWith(
      context.database,
      expect.objectContaining({
        paymentId: PAYMENT_ROW_ID,
        status: "approved",
        charged: { amountCents: 5990, platformFeeCents: 300 },
      }),
    );
  });

  test("does not settle the parcel with a payment that differs from its own checkout's amount", async () => {
    mercadoPagoAnswers(remotePayment({ transaction_amount: 61 }), {
      "pref-first": [987654321],
    });

    const result = await syncMercadoPagoPayment(context, {
      account,
      providerPaymentId: "987654321",
    });

    expect(result).toEqual({ kind: "ignored", reason: "amount_mismatch" });
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  test("does not settle the parcel with a payment that keeps another checkout's fee", async () => {
    mercadoPagoAnswers(
      remotePayment({ fee_details: [{ type: "application_fee", amount: 0.61 }] }),
      { "pref-first": [987654321] },
    );

    const result = await syncMercadoPagoPayment(context, {
      account,
      providerPaymentId: "987654321",
    });

    expect(result).toEqual({ kind: "ignored", reason: "fee_mismatch" });
  });

  test("does not settle the parcel with a payment that came through none of its checkouts", async () => {
    mercadoPagoAnswers(remotePayment(), { "pref-first": [111], "pref-latest": [222] });

    const result = await syncMercadoPagoPayment(context, {
      account,
      providerPaymentId: "987654321",
    });

    expect(result).toEqual({ kind: "ignored", reason: "outside_checkout" });
  });

  test("records the payment the parcel already holds without listing its checkouts again", async () => {
    mocks.findPayment.mockResolvedValue({
      ...parcel,
      status: "approved",
      amountCents: 5990,
      providerPaymentId: "987654321",
    });
    mercadoPagoAnswers(remotePayment({ status: "refunded", fee_details: [] }), {});

    await syncMercadoPagoPayment(context, { account, providerPaymentId: "987654321" });

    expect(mocks.listCheckouts).not.toHaveBeenCalled();
    expect(mocks.apply).toHaveBeenCalledWith(
      context.database,
      expect.objectContaining({ status: "refunded" }),
    );
  });
});

describe("a second approval of a paid parcel", () => {
  test("goes to the team's Problemas page on its own row, in Portuguese", async () => {
    const errors = vi.spyOn(logger, "error");
    mocks.findPayment.mockResolvedValue({
      ...parcel,
      status: "approved",
      amountCents: 5990,
      providerPaymentId: "111",
    });
    mocks.apply.mockResolvedValue({
      kind: "duplicate",
      payment: { ...parcel, status: "approved", amountCents: 5990, providerPaymentId: "111" },
    });
    mercadoPagoAnswers(remotePayment(), { "pref-first": [987654321] });

    await syncMercadoPagoPayment(context, { account, providerPaymentId: "987654321" });

    expect(errors).toHaveBeenCalledWith(
      "mercado_pago.duplicate_payment",
      expect.objectContaining({
        problemKey: PAYMENT_ROW_ID,
        reason: expect.stringContaining("Pagamento em dobro"),
        duplicatePaymentId: "987654321",
      }),
    );
  });
});

describe("reconcileShipmentPayment", () => {
  test("records a payment under review on an earlier checkout whose notice never came", async () => {
    mercadoPagoAnswers(remotePayment({ status: "in_process", date_approved: null }), {
      "pref-first": [987654321],
      "pref-latest": [],
    });
    mocks.findPayment
      .mockResolvedValueOnce(parcel)
      .mockResolvedValueOnce({ ...parcel, status: "in_process" });

    const settled = await reconcileShipmentPayment(context, {
      account,
      payment: parcel,
    });

    expect(mocks.apply).toHaveBeenCalledWith(
      context.database,
      expect.objectContaining({ status: "in_process", providerPaymentId: "987654321" }),
    );
    expect(settled).toMatchObject({ status: "in_process" });
  });

  test("asks Mercado Pago nothing for a parcel that never opened a checkout", async () => {
    mocks.listCheckouts.mockResolvedValue([]);

    const settled = await reconcileShipmentPayment(context, {
      account,
      payment: parcel,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(settled).toBe(parcel);
  });
});
