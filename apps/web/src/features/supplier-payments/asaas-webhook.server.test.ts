import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "e2e-asaas-webhook-token-0123456789abcdef";

const mocks = vi.hoisted(() => ({
  findAccounts: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
  sync: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  review: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  environment: {
    APP_URL: "http://localhost:3520",
    ADMIN_EMAILS: ["time@sellbridge.test"],
    ASAAS_API_URL: "https://asaas.test/v3",
    ASAAS_API_KEY: "platform-key",
    ASAAS_WALLET_ID: "wallet_sellbridge",
    ASAAS_WEBHOOK_TOKEN: "e2e-asaas-webhook-token-0123456789abcdef",
  } as Record<string, unknown>,
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findPaymentAccountsByProviderAccount: mocks.findAccounts,
}));
vi.mock("@sellbridge/payments/asaas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sellbridge/payments/asaas")>()),
  syncAsaasCharge: mocks.sync,
  refreshAsaasReview: mocks.review,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/marketplaces", () => ({
  tokenCipher: { encrypt: (value: string) => value, decrypt: (value: string) => value },
}));
vi.mock("@/lib/server/environment", () => ({ environment: mocks.environment }));

import { handleAsaasWebhook } from "./asaas-webhook.server";

const account = { id: "account-1", supplierId: "supplier-1", provider: "asaas" };

function notice(body: unknown, token: string | null = TOKEN): Request {
  return new Request("http://localhost:3520/api/webhooks/asaas", {
    method: "POST",
    headers: token === null ? {} : { "asaas-access-token": token },
    body: JSON.stringify(body),
  });
}

const paymentNotice = {
  id: "evt_1",
  event: "PAYMENT_RECEIVED",
  account: { id: "acc_1" },
  payment: { id: "pay_1" },
};

beforeEach(() => {
  mocks.findAccounts.mockReset().mockResolvedValue([account]);
  mocks.sync.mockReset().mockResolvedValue({ kind: "applied" });
  mocks.review.mockReset().mockResolvedValue({ reviewStatus: "approved", documentsUrl: null });
  mocks.environment.ASAAS_API_KEY = "platform-key";
});

describe("handleAsaasWebhook", () => {
  it("reads back the charge a payment notice names", async () => {
    const response = await handleAsaasWebhook(notice(paymentNotice));

    expect(response.status).toBe(200);
    expect(mocks.findAccounts).toHaveBeenCalledWith(
      {},
      { provider: "asaas", providerAccountId: "acc_1" },
    );
    expect(mocks.sync).toHaveBeenCalledWith(expect.anything(), { account, chargeId: "pay_1" });
  });

  it("refuses a notice without SellBridge's token", async () => {
    const response = await handleAsaasWebhook(notice(paymentNotice, "wrong-token"));

    expect(response.status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("refuses a notice with no token at all", async () => {
    const response = await handleAsaasWebhook(notice(paymentNotice, null));

    expect(response.status).toBe(401);
  });

  it("reads the account review again on an account status notice", async () => {
    const response = await handleAsaasWebhook(
      notice({
        id: "evt_2",
        event: "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED",
        account: { id: "acc_1" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.review).toHaveBeenCalledWith(expect.anything(), account);
  });

  it("still answers 200 when Asaas cannot be read back, so its queue never pauses", async () => {
    mocks.sync.mockRejectedValue(new Error("Asaas unreachable"));

    const response = await handleAsaasWebhook(notice(paymentNotice));

    expect(response.status).toBe(200);
  });

  it("answers 200 to a body that is not a notice and does nothing", async () => {
    const response = await handleAsaasWebhook(notice({ hello: "world" }));

    expect(response.status).toBe(200);
    expect(mocks.findAccounts).not.toHaveBeenCalled();
  });

  it("answers 404 while protected payments are off", async () => {
    mocks.environment.ASAAS_API_KEY = undefined;

    const response = await handleAsaasWebhook(notice(paymentNotice));

    expect(response.status).toBe(404);
  });
});
