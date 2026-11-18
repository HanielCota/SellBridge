import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAccount: vi.fn<(database: unknown, query: { provider: string }) => Promise<unknown>>(),
  findAccounts: vi.fn<(...input: unknown[]) => Promise<unknown[]>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findSupplierPaymentAccount: mocks.findAccount,
  findSupplierPaymentChoice: async () => "mercado_pago",
  getNewSupplierRule: async () => ({ enabled: false, deliveries: 5 }),
  countConfirmedDeliveries: async () => 0,
  findPaymentAccountsByProviderAccount: mocks.findAccounts,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/marketplaces", () => ({
  tokenCipher: { encrypt: (value: string) => value, decrypt: (value: string) => value },
}));
vi.mock("@/lib/server/environment", () => ({
  environment: {
    APP_URL: "https://app.sellbridge.test",
    ADMIN_EMAILS: ["time@sellbridge.test"],
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

import { receivingAccountsOf } from "./asaas.server";
import { mercadoPagoContext } from "./mercado-pago-accounts.server";
import { handleMercadoPagoWebhook } from "./mercado-pago-webhook.server";

const SUPPLIER_ID = "5f0c9a3e-6a1f-4d7e-9a43-8b2d1c3e4f50";
const mercadoPagoAccount = { provider: "mercado_pago", status: "connected" };
const asaasAccount = { provider: "asaas", status: "connected", reviewStatus: "approved" };

function accountsOnFile(accounts: { mercadoPago: unknown; asaas: unknown }): void {
  mocks.findAccount.mockImplementation(async (_database, query) =>
    query.provider === "asaas" ? accounts.asaas : accounts.mercadoPago,
  );
}

describe("supplier payments with Mercado Pago switched off and its keys set", () => {
  beforeEach(() => {
    mocks.findAccount.mockReset();
    mocks.findAccounts.mockReset();
  });

  it("gives the web app no Mercado Pago context", () => {
    expect(mercadoPagoContext()).toBeNull();
  });

  it("sends a new payment to Asaas even when the supplier chose a linked Mercado Pago", async () => {
    accountsOnFile({ mercadoPago: mercadoPagoAccount, asaas: asaasAccount });

    const accounts = await receivingAccountsOf(SUPPLIER_ID);

    expect(accounts.receiving).toEqual({ provider: "asaas", heldByRule: false });
  });

  it("leaves a supplier with only a linked Mercado Pago without a receiving account", async () => {
    accountsOnFile({ mercadoPago: mercadoPagoAccount, asaas: null });

    const accounts = await receivingAccountsOf(SUPPLIER_ID);

    expect(accounts.receiving).toEqual({ provider: null, reason: "no_account" });
  });

  it("answers a Mercado Pago notice as switched off without reading anything", async () => {
    const request = new Request("https://app.sellbridge.test/api/webhooks/mercado-pago", {
      method: "POST",
      body: JSON.stringify({ type: "payment", data: { id: "123" } }),
    });

    const response = await handleMercadoPagoWebhook(request);

    expect(response.status).toBe(404);
    expect(mocks.findAccounts).not.toHaveBeenCalled();
  });
});
