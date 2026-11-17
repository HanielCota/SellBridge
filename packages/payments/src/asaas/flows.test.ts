import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPayment: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  listCheckouts: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
  apply: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  saveEscrow: vi.fn<(...input: unknown[]) => Promise<void>>(),
  markReleased: vi.fn<(...input: unknown[]) => Promise<void>>(),
  claimRelease: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
  requestRefund: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  markRefundFailed: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
  markError: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
  savePreference: vi.fn<(...input: unknown[]) => Promise<void>>(),
  releaseReservation: vi.fn<(...input: unknown[]) => Promise<void>>(),
  saveAccount: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  markProtected: vi.fn<(...input: unknown[]) => Promise<void>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findShipmentPaymentById: mocks.findPayment,
  listShipmentPaymentCheckouts: mocks.listCheckouts,
  applyProviderPayment: mocks.apply,
  saveShipmentPaymentEscrow: mocks.saveEscrow,
  markEscrowReleased: mocks.markReleased,
  claimEscrowRelease: mocks.claimRelease,
  requestShipmentPaymentRefund: mocks.requestRefund,
  markShipmentPaymentRefundFailed: mocks.markRefundFailed,
  markSupplierPaymentAccountError: mocks.markError,
  savePaymentPreference: mocks.savePreference,
  releaseShipmentPaymentReservation: mocks.releaseReservation,
  saveAsaasAccount: mocks.saveAccount,
  markAsaasAccountProtected: mocks.markProtected,
  setPaymentAccountReview: vi.fn<(...input: unknown[]) => Promise<void>>(),
}));

import { createDatabase } from "@sellbridge/database/client";
import type {
  HeldPayment,
  ShipmentPayment,
  SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import {
  AsaasAccountKeyMissingError,
  openAsaasAccount,
  protectAsaasAccount,
} from "./account-opening.ts";
import { openAsaasCharge } from "./charge-opening.ts";
import { applyAsaasCharge } from "./charge-sync.ts";
import type { AsaasContext } from "./context.ts";
import { reportHeldWithoutAccount, settleHeldPayment } from "./held-money.ts";
import type { AsaasPayment } from "./schemas.ts";

const PAYMENT_ID = "0b8f7a6e-1c2d-4e3f-8a9b-7c6d5e4f3a21";
const SUPPLIER_ID = "5f0c9a3e-6a1f-4d7e-9a43-8b2d1c3e4f50";
const PLATFORM_WALLET = "wallet_sellbridge";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-12-10T12:00:00Z");

type Reply = { status: number; body: unknown };
const requests: { method: string; path: string; body: unknown }[] = [];
let replies: Reply[] = [];

async function fakeAsaas(url: string, init: RequestInit = {}): Promise<Response> {
  const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
  requests.push({ method: init.method ?? "GET", path: new URL(url).pathname, body });
  const reply = replies.shift() ?? { status: 500, body: {} };
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "content-type": "application/json" },
  });
}

const context: AsaasContext = {
  // Never connected: every database call in these tests is a mock.
  database: createDatabase("postgres://unused:unused@localhost:1/unused"),
  cipher: { encrypt: (value: string) => `enc:${value}`, decrypt: (value: string) => value },
  settings: {
    apiUrl: "https://asaas.test/v3",
    apiKey: "platform-key",
    walletId: PLATFORM_WALLET,
    webhookToken: "t".repeat(40),
  },
  fetchImplementation: fakeAsaas,
};

const account: SupplierPaymentAccount = {
  id: "account-1",
  supplierId: SUPPLIER_ID,
  provider: "asaas",
  providerAccountId: "acc_1",
  status: "connected",
  accessTokenEnc: "supplier-key",
  refreshTokenEnc: null,
  expiresAt: null,
  lastError: null,
  walletId: "wallet_supplier",
  reviewStatus: "approved",
  connectedByUserId: null,
  connectedAt: new Date(),
  updatedAt: new Date(),
};

function parcel(overrides: Partial<ShipmentPayment> = {}): ShipmentPayment {
  return {
    id: PAYMENT_ID,
    shipmentId: "6a1f4d7e-9a43-4b2d-8c3e-4f505f0c9a3e",
    supplierId: SUPPLIER_ID,
    provider: "asaas",
    status: "approved",
    amountCents: 10_000,
    platformFeeCents: 100,
    platformFeeBasisPoints: 100,
    preferenceId: "pay_1",
    checkoutUrl: null,
    checkoutExpiresAt: null,
    providerPaymentId: "pay_1",
    paymentMethod: "PIX",
    paidAt: new Date(NOW.getTime() - 20 * DAY_IN_MS),
    checkedAt: null,
    refundReason: null,
    refundRequestedAt: null,
    refundFailedAt: null,
    refundError: null,
    refundHeldAt: null,
    escrowId: "esc_1",
    escrowStatus: "active",
    escrowExpiresAt: new Date(NOW.getTime() + 10 * DAY_IN_MS),
    releaseRequestedAt: null,
    releasedAt: null,
    teamDecision: null,
    teamDecisionAt: null,
    teamDecisionByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function held(overrides: Partial<HeldPayment> = {}): HeldPayment {
  return {
    payment: parcel(),
    tenantId: "tenant-1",
    orderId: "order-1",
    shipmentStatus: "delivered",
    deliveredAt: new Date(NOW.getTime() - 8 * DAY_IN_MS),
    hasOpenReturnClaim: false,
    cancelledByResellerAfterAccept: false,
    ...overrides,
  };
}

function charge(overrides: Partial<AsaasPayment> = {}): AsaasPayment {
  return {
    id: "pay_1",
    status: "RECEIVED",
    value: 100,
    billingType: "PIX",
    externalReference: PAYMENT_ID,
    invoiceUrl: "https://asaas.test/i/1",
    split: [{ walletId: PLATFORM_WALLET, fixedValue: 1 }],
    escrow: { id: "esc_1", status: "ACTIVE", expirationDate: "2026-12-20" },
    ...overrides,
  };
}

beforeEach(() => {
  requests.length = 0;
  replies = [];
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  mocks.listCheckouts.mockResolvedValue([
    { preferenceId: "pay_1", amountCents: 10_000, platformFeeCents: 100 },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settleHeldPayment", () => {
  test("releases the money seven days after the delivery, once", async () => {
    mocks.claimRelease.mockResolvedValue(true);
    replies = [{ status: 200, body: charge() }];

    const outcome = await settleHeldPayment(context, { account, held: held(), now: NOW });

    expect(outcome).toEqual({ kind: "released" });
    expect(requests).toEqual([{ method: "POST", path: "/v3/escrow/esc_1/finish", body: null }]);
    expect(mocks.markReleased).toHaveBeenCalledWith(context.database, {
      paymentId: PAYMENT_ID,
      now: NOW,
    });
  });

  test("never asks Asaas when another round already claimed the release", async () => {
    mocks.claimRelease.mockResolvedValue(false);

    const outcome = await settleHeldPayment(context, { account, held: held(), now: NOW });

    expect(outcome).toEqual({ kind: "kept", action: "release" });
    expect(requests).toHaveLength(0);
  });

  test("keeps the money held when the release is not confirmed", async () => {
    mocks.claimRelease.mockResolvedValue(true);
    replies = [{ status: 503, body: {} }];

    const outcome = await settleHeldPayment(context, { account, held: held(), now: NOW });

    expect(outcome).toEqual({ kind: "kept", action: "release" });
    expect(mocks.markReleased).not.toHaveBeenCalled();
  });

  test("refunds the reseller from the held money when the parcel was cancelled", async () => {
    mocks.requestRefund.mockResolvedValue(
      parcel({ refundRequestedAt: NOW, refundReason: "cancelled" }),
    );
    replies = [{ status: 200, body: charge({ status: "REFUNDED" }) }];

    const outcome = await settleHeldPayment(context, {
      account,
      held: held({ shipmentStatus: "cancelled", deliveredAt: null }),
      now: NOW,
    });

    expect(outcome).toEqual({ kind: "refund_requested", reason: "cancelled" });
    expect(requests).toEqual([
      {
        method: "POST",
        path: "/v3/payments/pay_1/refund",
        body: { description: "Pagamento devolvido pelo SellBridge" },
      },
    ]);
  });

  test("does not ask for a refund again right after the first request", async () => {
    const askedAt = new Date(NOW.getTime() - 5 * 60 * 1000);
    const alreadyAsked = parcel({ refundRequestedAt: askedAt, refundReason: "cancelled" });
    mocks.requestRefund.mockResolvedValue(alreadyAsked);

    const outcome = await settleHeldPayment(context, {
      account,
      held: held({ payment: alreadyAsked, shipmentStatus: "cancelled" }),
      now: NOW,
    });

    expect(outcome).toEqual({ kind: "kept", action: "refund" });
    expect(requests).toHaveLength(0);
  });

  test("hands a refused refund to the team", async () => {
    mocks.requestRefund.mockResolvedValue(parcel({ refundRequestedAt: NOW }));
    mocks.markRefundFailed.mockResolvedValue(true);
    replies = [
      { status: 400, body: { errors: [{ code: "x", description: "Saldo insuficiente." }] } },
    ];
    const errors = vi.spyOn(logger, "error").mockImplementation(() => {});

    const outcome = await settleHeldPayment(context, {
      account,
      held: held({ shipmentStatus: "returned" }),
      now: NOW,
    });

    expect(outcome).toEqual({ kind: "refund_refused" });
    expect(mocks.markRefundFailed).toHaveBeenCalledOnce();
    expect(errors).toHaveBeenCalledWith("asaas.refund_refused", expect.anything());
  });

  test("follows the team's refund for a held payment", async () => {
    mocks.requestRefund.mockResolvedValue(parcel({ refundRequestedAt: NOW, refundReason: "team" }));
    replies = [{ status: 200, body: charge({ status: "REFUNDED" }) }];

    const outcome = await settleHeldPayment(context, {
      account,
      held: held({ payment: parcel({ teamDecision: "refund" }), hasOpenReturnClaim: true }),
      now: NOW,
    });

    expect(outcome).toEqual({ kind: "refund_requested", reason: "team" });
  });

  test("asks the team to decide while a return claim is open", async () => {
    const errors = vi.spyOn(logger, "error").mockImplementation(() => {});

    const outcome = await settleHeldPayment(context, {
      account,
      held: held({ hasOpenReturnClaim: true }),
      now: NOW,
    });

    expect(outcome).toEqual({ kind: "kept", action: "paused" });
    expect(errors).toHaveBeenCalledWith(
      "asaas.held_payment_needs_decision",
      expect.objectContaining({ shipmentPaymentId: PAYMENT_ID, problemKey: PAYMENT_ID }),
    );
    expect(requests).toHaveLength(0);
  });

  test("asks the team instead of refunding when the reseller cancelled after acceptance", async () => {
    const errors = vi.spyOn(logger, "error").mockImplementation(() => {});

    const outcome = await settleHeldPayment(context, {
      account,
      held: held({ shipmentStatus: "cancelled", cancelledByResellerAfterAccept: true }),
      now: NOW,
    });

    expect(outcome).toEqual({ kind: "kept", action: "paused" });
    expect(errors).toHaveBeenCalledWith(
      "asaas.held_payment_needs_decision",
      expect.objectContaining({ shipmentPaymentId: PAYMENT_ID }),
    );
    expect(mocks.requestRefund).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });

  test("warns the team when Asaas's deadline is near and nothing was delivered", async () => {
    const errors = vi.spyOn(logger, "error").mockImplementation(() => {});
    const nearDeadline = parcel({ escrowExpiresAt: new Date(NOW.getTime() + 3 * DAY_IN_MS) });

    await settleHeldPayment(context, {
      account,
      held: held({ payment: nearDeadline, shipmentStatus: "shipped", deliveredAt: null }),
      now: NOW,
    });

    expect(errors).toHaveBeenCalledWith("asaas.held_payment_needs_decision", expect.anything());
  });
});

describe("held money the team must see", () => {
  test("asks the team to follow a card dispute", async () => {
    const errors = vi.spyOn(logger, "error").mockImplementation(() => {});
    const disputed = held({ payment: parcel({ status: "charged_back" }) });

    const outcome = await settleHeldPayment(context, { account, held: disputed, now: NOW });

    expect(outcome).toEqual({ kind: "kept", action: "paused" });
    expect(errors).toHaveBeenCalledWith(
      "asaas.held_payment_needs_decision",
      expect.objectContaining({ problemKey: PAYMENT_ID }),
    );
  });

  test("reports a cancelled parcel whose supplier account cannot be used", () => {
    const errors = vi.spyOn(logger, "error").mockImplementation(() => {});

    reportHeldWithoutAccount(held({ shipmentStatus: "cancelled", deliveredAt: null }), NOW);

    expect(errors).toHaveBeenCalledWith(
      "asaas.held_payment_needs_decision",
      expect.objectContaining({ problemKey: PAYMENT_ID }),
    );
  });

  test("stays quiet about a parcel only waiting for its release", () => {
    const errors = vi.spyOn(logger, "error").mockImplementation(() => {});
    const recent = held({ deliveredAt: new Date(NOW.getTime() - DAY_IN_MS) });

    reportHeldWithoutAccount(recent, NOW);

    expect(errors).not.toHaveBeenCalled();
  });
});

describe("applyAsaasCharge", () => {
  test("records a paid charge and the guarantee holding its money", async () => {
    mocks.findPayment.mockResolvedValue(parcel({ status: "pending", providerPaymentId: null }));
    mocks.apply.mockResolvedValue({ kind: "applied", payment: parcel() });

    const result = await applyAsaasCharge(context, { account, charge: charge() });

    expect(result.kind).toBe("applied");
    expect(mocks.apply).toHaveBeenCalledWith(
      context.database,
      expect.objectContaining({
        paymentId: PAYMENT_ID,
        providerPaymentId: "pay_1",
        status: "approved",
      }),
    );
    expect(mocks.saveEscrow).toHaveBeenCalledWith(context.database, {
      paymentId: PAYMENT_ID,
      escrowId: "esc_1",
      escrowStatus: "active",
      escrowExpiresAt: new Date("2026-12-20T03:00:00Z"),
    });
  });

  test("records the day Asaas confirmed the money, at noon in São Paulo", async () => {
    mocks.findPayment.mockResolvedValue(parcel({ status: "pending", providerPaymentId: null }));
    mocks.apply.mockResolvedValue({ kind: "applied", payment: parcel() });

    await applyAsaasCharge(context, { account, charge: charge({ confirmedDate: "2026-12-08" }) });

    expect(mocks.apply).toHaveBeenCalledWith(
      context.database,
      expect.objectContaining({ approvedAt: new Date("2026-12-08T15:00:00Z") }),
    );
  });

  test("refuses a charge whose payment date cannot be read, without recording it", async () => {
    mocks.findPayment.mockResolvedValue(parcel({ status: "pending", providerPaymentId: null }));

    const result = applyAsaasCharge(context, {
      account,
      charge: charge({ confirmedDate: "08/12/2026" }),
    });

    await expect(result).rejects.toThrow('invalid payment date "08/12/2026"');
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  test("ignores a charge SellBridge did not open for the parcel", async () => {
    mocks.findPayment.mockResolvedValue(parcel());

    const result = await applyAsaasCharge(context, {
      account,
      charge: charge({ id: "pay_other" }),
    });

    expect(result).toEqual({ kind: "ignored", reason: "outside_checkout" });
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  test("ignores a charge without SellBridge's fee in the split", async () => {
    mocks.findPayment.mockResolvedValue(parcel());

    const result = await applyAsaasCharge(context, { account, charge: charge({ split: [] }) });

    expect(result).toEqual({ kind: "ignored", reason: "fee_mismatch" });
  });

  test("ignores a charge of another supplier", async () => {
    mocks.findPayment.mockResolvedValue(parcel({ supplierId: "someone-else" }));

    const result = await applyAsaasCharge(context, { account, charge: charge() });

    expect(result).toEqual({ kind: "ignored", reason: "unknown_payment" });
  });

  test("hands the team a paid charge that does not ask what SellBridge opened", async () => {
    mocks.findPayment.mockResolvedValue(parcel());
    const errors = vi.spyOn(logger, "error").mockImplementation(() => {});

    const result = await applyAsaasCharge(context, { account, charge: charge({ value: 150 }) });

    expect(result).toEqual({ kind: "ignored", reason: "amount_mismatch" });
    expect(errors).toHaveBeenCalledWith(
      "asaas.paid_charge_refused",
      expect.objectContaining({ problemKey: "pay_1", shipmentPaymentId: PAYMENT_ID }),
    );
  });

  test("warns the team when the guarantee ends early without SellBridge", async () => {
    vi.useFakeTimers({ now: NOW });
    mocks.findPayment.mockResolvedValue(parcel());
    mocks.apply.mockResolvedValue({ kind: "applied", payment: parcel() });
    const errors = vi.spyOn(logger, "error").mockImplementation(() => {});
    const ended = charge({ escrow: { id: "esc_1", status: "DONE", expirationDate: "2026-12-20" } });

    await applyAsaasCharge(context, { account, charge: ended });

    expect(errors).toHaveBeenCalledWith(
      "asaas.escrow_ended_unexpectedly",
      expect.objectContaining({ problemKey: "esc_1", shipmentPaymentId: PAYMENT_ID }),
    );
    expect(mocks.markReleased).toHaveBeenCalled();
    vi.useRealTimers();
  });

  test("records without alarm a guarantee SellBridge asked to end", async () => {
    vi.useFakeTimers({ now: NOW });
    const asked = parcel({ releaseRequestedAt: new Date(NOW.getTime() - 60_000) });
    mocks.findPayment.mockResolvedValue(asked);
    mocks.apply.mockResolvedValue({ kind: "applied", payment: asked });
    const errors = vi.spyOn(logger, "error").mockImplementation(() => {});
    const ended = charge({ escrow: { id: "esc_1", status: "DONE", expirationDate: "2026-12-20" } });

    await applyAsaasCharge(context, { account, charge: ended });

    expect(errors).not.toHaveBeenCalled();
    expect(mocks.markReleased).toHaveBeenCalled();
    vi.useRealTimers();
  });

  test("reports a second paid charge as a duplicate on Problemas", async () => {
    mocks.findPayment.mockResolvedValue(parcel());
    mocks.listCheckouts.mockResolvedValue([
      { preferenceId: "pay_1", amountCents: 10_000, platformFeeCents: 100 },
      { preferenceId: "pay_2", amountCents: 10_000, platformFeeCents: 100 },
    ]);
    mocks.apply.mockResolvedValue({ kind: "duplicate", payment: parcel() });
    const errors = vi.spyOn(logger, "error").mockImplementation(() => {});

    const result = await applyAsaasCharge(context, { account, charge: charge({ id: "pay_2" }) });

    expect(result).toEqual({ kind: "ignored", reason: "duplicate" });
    expect(errors).toHaveBeenCalledWith(
      "asaas.duplicate_payment",
      expect.objectContaining({ duplicatePaymentId: "pay_2", recordedPaymentId: "pay_1" }),
    );
  });
});

describe("openAsaasCharge", () => {
  const payer = { tenantId: "tenant-1", name: "Revenda Teste", cpfCnpj: "12345678901" };
  const opening = {
    account,
    payment: parcel({ status: "pending", providerPaymentId: null, preferenceId: null }),
    payer,
    description: "Pedido 1",
    successUrl: "https://sellbridge.test/pedidos/1",
    now: NOW,
  };

  test("reuses the parcel's unpaid charge instead of opening a second one", async () => {
    replies = [
      {
        status: 200,
        body: { hasMore: false, data: [charge({ status: "PENDING", escrow: null })] },
      },
    ];

    const result = await openAsaasCharge(context, opening);

    expect(result).toEqual({ kind: "opened", checkoutUrl: "https://asaas.test/i/1" });
    expect(requests.map((request) => request.method)).toEqual(["GET"]);
  });

  test("replaces an open charge that no longer asks what the parcel asks", async () => {
    replies = [
      {
        status: 200,
        body: { hasMore: false, data: [charge({ status: "PENDING", escrow: null, value: 150 })] },
      },
      { status: 200, body: { deleted: true, id: "pay_1" } },
      { status: 200, body: { data: [{ id: "cus_1" }] } },
      { status: 200, body: charge({ id: "pay_new", status: "PENDING", escrow: null }) },
    ];

    await openAsaasCharge(context, opening);

    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      "GET /v3/payments",
      "DELETE /v3/payments/pay_1",
      "GET /v3/customers",
      "POST /v3/payments",
    ]);
  });

  test("replaces an open charge that came without a payment page", async () => {
    replies = [
      {
        status: 200,
        body: {
          hasMore: false,
          data: [charge({ status: "PENDING", escrow: null, invoiceUrl: null })],
        },
      },
      { status: 200, body: { deleted: true, id: "pay_1" } },
      { status: 200, body: { data: [{ id: "cus_1" }] } },
      { status: 200, body: charge({ id: "pay_new", status: "PENDING", escrow: null }) },
    ];

    const result = await openAsaasCharge(context, opening);

    expect(result).toEqual({ kind: "opened", checkoutUrl: "https://asaas.test/i/1" });
    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      "GET /v3/payments",
      "DELETE /v3/payments/pay_1",
      "GET /v3/customers",
      "POST /v3/payments",
    ]);
  });

  test("never saves an empty payment page for a new charge", async () => {
    replies = [
      { status: 200, body: { hasMore: false, data: [] } },
      { status: 200, body: { data: [{ id: "cus_1" }] } },
      {
        status: 200,
        body: charge({ id: "pay_new", status: "PENDING", escrow: null, invoiceUrl: null }),
      },
    ];

    await expect(openAsaasCharge(context, opening)).rejects.toThrow("without a payment page");
    expect(mocks.savePreference).not.toHaveBeenCalled();
  });

  test("records a paid charge it finds instead of opening another", async () => {
    replies = [{ status: 200, body: { hasMore: false, data: [charge()] } }];
    mocks.findPayment.mockResolvedValue(opening.payment);
    mocks.apply.mockResolvedValue({ kind: "applied", payment: parcel() });

    const result = await openAsaasCharge(context, opening);

    expect(result).toEqual({ kind: "already_paid" });
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
  });

  test("removes an overdue charge before opening the new one", async () => {
    replies = [
      {
        status: 200,
        body: { hasMore: false, data: [charge({ id: "pay_old", status: "OVERDUE" })] },
      },
      { status: 200, body: { deleted: true, id: "pay_old" } },
      { status: 200, body: { data: [{ id: "cus_1" }] } },
      { status: 200, body: charge({ id: "pay_new", status: "PENDING", escrow: null }) },
    ];

    await openAsaasCharge(context, opening);

    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      "GET /v3/payments",
      "DELETE /v3/payments/pay_old",
      "GET /v3/customers",
      "POST /v3/payments",
    ]);
    expect(requests.at(-1)?.body).toMatchObject({
      externalReference: PAYMENT_ID,
      split: [{ walletId: PLATFORM_WALLET, fixedValue: 1 }],
    });
  });

  test("frees the parcel when Asaas refuses the charge", async () => {
    replies = [
      { status: 200, body: { hasMore: false, data: [] } },
      { status: 200, body: { data: [{ id: "cus_1" }] } },
      { status: 400, body: { errors: [{ code: "invalid_customer" }] } },
    ];

    await expect(openAsaasCharge(context, opening)).rejects.toThrow("Asaas answered 400");
    expect(mocks.releaseReservation).toHaveBeenCalledWith(context.database, PAYMENT_ID);
  });

  test("keeps the parcel reserved when the charge's outcome is unknown", async () => {
    replies = [
      { status: 200, body: { hasMore: false, data: [] } },
      { status: 200, body: { data: [{ id: "cus_1" }] } },
      { status: 502, body: {} },
    ];

    await expect(openAsaasCharge(context, opening)).rejects.toThrow("Asaas answered 502");
    expect(mocks.releaseReservation).not.toHaveBeenCalled();
  });
});

describe("openAsaasAccount", () => {
  const opening = {
    supplierId: SUPPLIER_ID,
    userId: "user-1",
    data: {
      name: "Fornecedor",
      email: "f@fornecedor.test",
      cpfCnpj: "11222333000181",
      birthDate: null,
      companyType: "LIMITED",
      mobilePhone: "11987654321",
      address: "Rua A",
      addressNumber: "1",
      complement: null,
      province: "Centro",
      postalCode: "01001000",
      incomeValueCents: 1_000_000,
    },
    webhookUrl: "https://sellbridge.test/api/webhooks/asaas",
    noticeEmail: "time@sellbridge.test",
  };

  test("keeps the new account's key encrypted and turns its protection on", async () => {
    replies = [
      { status: 200, body: { id: "acc_1", walletId: "wallet_1", apiKey: "new-key" } },
      { status: 200, body: { enabled: true, daysToExpire: 30, isFeePayer: true } },
    ];
    mocks.saveAccount.mockResolvedValue(account);

    const result = await openAsaasAccount(context, opening);

    expect(result.protectedNow).toBe(true);
    expect(mocks.saveAccount).toHaveBeenCalledWith(
      context.database,
      expect.objectContaining({ walletId: "wallet_1", apiKeyEnc: "enc:new-key" }),
    );
    expect(requests[1]).toEqual({
      method: "POST",
      path: "/v3/accounts/acc_1/escrow",
      body: { enabled: true, daysToExpire: 30, isFeePayer: true },
    });
  });

  test("keeps the account out of service when its protection fails", async () => {
    replies = [
      { status: 200, body: { id: "acc_1", walletId: "wallet_1", apiKey: "new-key" } },
      { status: 400, body: { errors: [{ code: "escrow_unavailable" }] } },
    ];
    mocks.saveAccount.mockResolvedValue(account);
    vi.spyOn(logger, "error").mockImplementation(() => {});

    const result = await openAsaasAccount(context, opening);

    expect(result.protectedNow).toBe(false);
    expect(mocks.markError).toHaveBeenCalledWith(context.database, {
      accountId: account.id,
      lastError: "protection_missing",
      refreshTokenEnc: null,
    });
  });

  test("keeps an account without its Asaas id out of service, without calling Asaas", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});

    const result = await protectAsaasAccount(context, { ...account, providerAccountId: null });

    expect(result).toBe(false);
    expect(requests).toHaveLength(0);
    expect(mocks.markError).toHaveBeenCalledWith(context.database, {
      accountId: account.id,
      lastError: "protection_missing",
      refreshTokenEnc: null,
    });
  });

  test("refuses an account Asaas opened without returning its key", async () => {
    replies = [{ status: 200, body: { id: "acc_1", walletId: "wallet_1" } }];
    vi.spyOn(logger, "error").mockImplementation(() => {});

    await expect(openAsaasAccount(context, opening)).rejects.toBeInstanceOf(
      AsaasAccountKeyMissingError,
    );
    expect(mocks.saveAccount).not.toHaveBeenCalled();
  });
});
