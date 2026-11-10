import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mercadoPagoSignatureFor } from "./mercado-pago-signature";

const mocks = vi.hoisted(() => ({
  findAccounts: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
  findPayment: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  apply: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  markError: vi.fn<(...input: unknown[]) => Promise<void>>(),
  rotate: vi.fn<(...input: unknown[]) => Promise<boolean>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findPaymentAccountsByProviderAccount: mocks.findAccounts,
  findShipmentPaymentById: mocks.findPayment,
  applyProviderPayment: mocks.apply,
  markSupplierPaymentAccountError: mocks.markError,
  rotatePaymentAccountTokens: mocks.rotate,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/marketplaces", () => ({
  tokenCipher: {
    encrypt: (value: string) => `enc:${value}`,
    decrypt: (value: string) => value.replace("enc:", ""),
  },
}));
vi.mock("@/lib/server/environment", () => ({
  environment: {
    APP_URL: "https://app.sellbridge.test",
    MERCADO_PAGO_CLIENT_ID: "client",
    MERCADO_PAGO_CLIENT_SECRET: "secret",
    MERCADO_PAGO_WEBHOOK_SECRET: "signature-secret",
    MERCADO_PAGO_TEST_MODE: false,
    MERCADO_PAGO_API_URL: "https://api.mercadopago.test",
    MERCADO_PAGO_AUTH_URL: "https://auth.mercadopago.test",
  },
}));

import { handleMercadoPagoWebhook } from "./mercado-pago-webhook.server";

const SUPPLIER_ID = "5f0c9a3e-6a1f-4d7e-9a43-8b2d1c3e4f50";
const PAYMENT_ROW_ID = "0b8f7a6e-1c2d-4e3f-8a9b-7c6d5e4f3a21";
const account = {
  id: "account-1",
  supplierId: SUPPLIER_ID,
  providerAccountId: "112233",
  status: "connected",
  accessTokenEnc: "enc:seller-token",
  refreshTokenEnc: "enc:refresh",
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
};
const PREFERENCE_ID = "112233-preference-1";
const localPayment = {
  id: PAYMENT_ROW_ID,
  supplierId: SUPPLIER_ID,
  amountCents: 5990,
  platformFeeCents: 300,
  preferenceId: PREFERENCE_ID,
  providerPaymentId: null,
};

function notice(
  input: { dataId?: string; bodyDataId?: string; type?: string; secret?: string } = {},
): Request {
  const dataId = input.dataId ?? "987654321";
  const body = JSON.stringify({
    type: input.type ?? "payment",
    action: "payment.updated",
    user_id: 112233,
    data: { id: input.bodyDataId ?? dataId },
  });
  const signature = mercadoPagoSignatureFor({
    secret: input.secret ?? "signature-secret",
    dataId,
    requestId: "request-1",
    ts: "1731250000",
  });
  return new Request(
    `https://app.sellbridge.test/api/webhooks/mercado-pago?data.id=${dataId}&type=payment`,
    {
      method: "POST",
      headers: { "x-signature": signature, "x-request-id": "request-1" },
      body,
    },
  );
}

function remotePayment(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      id: 987654321,
      status: "approved",
      external_reference: PAYMENT_ROW_ID,
      date_approved: "2026-11-10T14:32:00.000-03:00",
      transaction_amount: 59.9,
      payment_type_id: "bank_transfer",
      currency_id: "BRL",
      collector_id: 112233,
      fee_details: [
        { type: "mercadopago_fee", amount: 0.59, fee_payer: "collector" },
        { type: "application_fee", amount: 3, fee_payer: "collector" },
      ],
      ...overrides,
    }),
    { status: 200 },
  );
}

function merchantOrders(paymentIds: number[] = [987654321]) {
  return new Response(
    JSON.stringify({
      elements: [{ preference_id: PREFERENCE_ID, payments: paymentIds.map((id) => ({ id })) }],
      next_offset: 1,
      total: 1,
    }),
    { status: 200 },
  );
}

const fetchMock = vi.fn<(...input: unknown[]) => Promise<Response>>();

/** Answers the payment read with `payment` and the checkout's merchant orders with `orders`. */
function mercadoPagoAnswers(payment: Response, orders: Response = merchantOrders()): void {
  fetchMock.mockImplementation(async (url: unknown) => {
    if (String(url).includes("/merchant_orders/search")) {
      return orders;
    }
    return payment;
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  mocks.findAccounts.mockResolvedValue([account]);
  mocks.findPayment.mockResolvedValue(localPayment);
  mocks.apply.mockResolvedValue({
    kind: "applied",
    payment: { ...localPayment, status: "approved" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("handleMercadoPagoWebhook", () => {
  it("records an approved payment read back with the supplier's token", async () => {
    mercadoPagoAnswers(remotePayment());

    const response = await handleMercadoPagoWebhook(notice());

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.test/v1/payments/987654321",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer seller-token" }),
      }),
    );
    expect(mocks.apply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        paymentId: PAYMENT_ROW_ID,
        providerPaymentId: "987654321",
        status: "approved",
        paymentMethod: "bank_transfer",
      }),
    );
  });

  it("records a payment from SellBridge's checkout that keeps SellBridge's fee", async () => {
    mercadoPagoAnswers(remotePayment());

    await handleMercadoPagoWebhook(notice());

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.mercadopago.test/merchant_orders/search?preference_id=${PREFERENCE_ID}`,
      expect.anything(),
    );
    expect(mocks.apply).toHaveBeenCalledTimes(1);
  });

  it("does not mark paid a payment of the right amount, account and currency without SellBridge's fee", async () => {
    mercadoPagoAnswers(remotePayment({ fee_details: [] }));

    const response = await handleMercadoPagoWebhook(notice());

    expect(response.status).toBe(200);
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("does not mark paid a payment that keeps a smaller fee than the parcel's", async () => {
    mercadoPagoAnswers(
      remotePayment({
        fee_details: [{ type: "application_fee", amount: 0.01, fee_payer: "collector" }],
      }),
    );

    await handleMercadoPagoWebhook(notice());

    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("does not mark paid a payment made outside SellBridge's checkout for the parcel", async () => {
    mercadoPagoAnswers(remotePayment(), merchantOrders([111]));

    await handleMercadoPagoWebhook(notice());

    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("does not mark paid a payment for a parcel that never opened a checkout", async () => {
    mercadoPagoAnswers(remotePayment());
    mocks.findPayment.mockResolvedValue({ ...localPayment, preferenceId: null });

    await handleMercadoPagoWebhook(notice());

    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("records the refund of the payment already on the parcel even when its fee changed", async () => {
    mercadoPagoAnswers(remotePayment({ status: "refunded", fee_details: [] }));
    mocks.findPayment.mockResolvedValue({
      ...localPayment,
      status: "approved",
      providerPaymentId: "987654321",
    });

    await handleMercadoPagoWebhook(notice());

    expect(mocks.apply).toHaveBeenCalledWith({}, expect.objectContaining({ status: "refunded" }));
  });

  it("refuses a notice with a wrong signature without calling Mercado Pago", async () => {
    const response = await handleMercadoPagoWebhook(notice({ secret: "forged" }));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("does not mark paid a payment of another amount", async () => {
    fetchMock.mockResolvedValue(remotePayment({ transaction_amount: 1 }));

    const response = await handleMercadoPagoWebhook(notice());

    expect(response.status).toBe(200);
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("does not apply a payment made for another supplier's parcel", async () => {
    fetchMock.mockResolvedValue(remotePayment());
    mocks.findPayment.mockResolvedValue({ ...localPayment, supplierId: "another-supplier" });

    await handleMercadoPagoWebhook(notice());

    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("ignores a payment that names no parcel of SellBridge", async () => {
    fetchMock.mockResolvedValue(remotePayment({ external_reference: "order-of-another-shop" }));

    const response = await handleMercadoPagoWebhook(notice());

    expect(response.status).toBe(200);
    expect(mocks.findPayment).not.toHaveBeenCalled();
  });

  it("does not mark paid a payment that went to another Mercado Pago account", async () => {
    fetchMock.mockResolvedValue(remotePayment({ collector_id: 999 }));

    await handleMercadoPagoWebhook(notice());

    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("refuses a signed address whose body names another payment", async () => {
    const response = await handleMercadoPagoWebhook(notice({ bodyDataId: "111" }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 500 when Mercado Pago fails, so the notice comes again", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));

    const response = await handleMercadoPagoWebhook(notice());

    expect(response.status).toBe(500);
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("ignores notices that are not about payments", async () => {
    const response = await handleMercadoPagoWebhook(notice({ type: "mp-connect" }));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a notice for an account no supplier has linked", async () => {
    mocks.findAccounts.mockResolvedValue([]);

    const response = await handleMercadoPagoWebhook(notice());

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Mercado Pago to retry a notice for a supplier whose account is in error", async () => {
    mocks.findAccounts.mockResolvedValue([{ ...account, status: "error" }]);

    const response = await handleMercadoPagoWebhook(notice());

    expect(response.status).toBe(503);
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("marks the account in error and asks for a retry when Mercado Pago refuses its token", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));

    const response = await handleMercadoPagoWebhook(notice());

    expect(response.status).toBe(503);
    expect(mocks.markError).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ accountId: "account-1", refreshTokenEnc: "enc:refresh" }),
    );
  });
});
