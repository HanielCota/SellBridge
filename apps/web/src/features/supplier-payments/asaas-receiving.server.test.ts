import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAccount: vi.fn<(database: unknown, query: { provider: string }) => Promise<unknown>>(),
  getRule: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
  countDeliveries: vi.fn<(...input: unknown[]) => Promise<number>>(),
  saveChoice: vi.fn<(...input: unknown[]) => Promise<void>>(),
  signupRulesSince: vi.fn<(...input: unknown[]) => Promise<Date | null>>(),
  company: vi.fn<(...input: unknown[]) => Promise<{ cnpj: string; legalName: string } | null>>(),
  openAsaasAccount: vi.fn<(...input: unknown[]) => Promise<{ protectedNow: boolean }>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findSupplierPaymentAccount: mocks.findAccount,
  findSupplierPaymentChoice: async () => null,
  getNewSupplierRule: mocks.getRule,
  countConfirmedDeliveries: mocks.countDeliveries,
  saveSupplierPaymentChoice: mocks.saveChoice,
  getSignupRulesSince: mocks.signupRulesSince,
  getSupplierCompany: mocks.company,
}));
vi.mock("@sellbridge/payments/asaas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sellbridge/payments/asaas")>()),
  openAsaasAccount: mocks.openAsaasAccount,
}));
vi.mock("@sellbridge/payments/mercado-pago", async (importOriginal) => {
  const original = await importOriginal<typeof import("@sellbridge/payments/mercado-pago")>();
  return {
    ...original,
    // The hidden Mercado Pago code is tested switched on; the app keeps it off.
    mercadoPagoSettingsFrom: (
      environment: Parameters<typeof original.mercadoPagoSettingsFrom>[0],
    ) => original.mercadoPagoSettingsFrom(environment, true),
  };
});
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/marketplaces", () => ({
  tokenCipher: { encrypt: (value: string) => value, decrypt: (value: string) => value },
}));
vi.mock("@/lib/server/environment", () => ({
  environment: {
    APP_URL: "http://localhost:3510",
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

import type { AsaasAccountForm } from "./asaas-account-form";
import { chooseReceivingProvider, openSupplierAsaasAccount } from "./asaas-receiving.server";

const SUPPLIER_ID = "5f0c9a3e-6a1f-4d7e-9a43-8b2d1c3e4f50";
const supplierActor = { viewerKind: "supplier", impersonatedBy: null } as const;
const connected = { id: "account-1", supplierId: SUPPLIER_ID, status: "connected" };
const accounts = {
  mercado_pago: { ...connected, provider: "mercado_pago", reviewStatus: null },
  asaas: { ...connected, provider: "asaas", reviewStatus: "approved", lastError: null },
};

function choose(provider: "mercado_pago" | "asaas") {
  return chooseReceivingProvider({
    supplierId: SUPPLIER_ID,
    provider,
    userId: "user-1",
    actor: supplierActor,
  });
}

beforeEach(() => {
  mocks.findAccount.mockImplementation(async (_database, query) =>
    query.provider === "asaas" ? accounts.asaas : accounts.mercado_pago,
  );
  mocks.getRule.mockResolvedValue({ enabled: false, deliveries: 5 });
  mocks.countDeliveries.mockResolvedValue(0);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("chooseReceivingProvider", () => {
  it("refuses Mercado Pago for a new supplier while the admin rule holds", async () => {
    mocks.getRule.mockResolvedValue({ enabled: true, deliveries: 5 });
    mocks.countDeliveries.mockResolvedValue(4);

    await expect(choose("mercado_pago")).rejects.toThrow("até completar 5 entregas");
    expect(mocks.saveChoice).not.toHaveBeenCalled();
  });

  it("lets the supplier pick Mercado Pago once it completed the rule's deliveries", async () => {
    mocks.getRule.mockResolvedValue({ enabled: true, deliveries: 5 });
    mocks.countDeliveries.mockResolvedValue(5);

    const result = await choose("mercado_pago");

    expect(result).toEqual({ provider: "mercado_pago" });
    expect(mocks.saveChoice).toHaveBeenCalledWith(
      {},
      { supplierId: SUPPLIER_ID, provider: "mercado_pago", userId: "user-1" },
    );
  });

  it("refuses Asaas while Asaas has not approved the account", async () => {
    mocks.findAccount.mockImplementation(async (_database, query) =>
      query.provider === "asaas"
        ? { ...accounts.asaas, reviewStatus: "pending" }
        : accounts.mercado_pago,
    );

    await expect(choose("asaas")).rejects.toThrow("precisa estar aprovada");
    expect(mocks.saveChoice).not.toHaveBeenCalled();
  });

  it("refuses the choice during a team visit", async () => {
    const visit = chooseReceivingProvider({
      supplierId: SUPPLIER_ID,
      provider: "asaas",
      userId: "user-1",
      actor: { viewerKind: "supplier", impersonatedBy: "team-1" },
    });

    await expect(visit).rejects.toThrow("Durante a visita da equipe");
    expect(mocks.saveChoice).not.toHaveBeenCalled();
  });
});

const COMPANY_CNPJ = "11222333000181";
const companyForm: AsaasAccountForm = {
  personType: "company",
  name: "Casa das Panelas Ltda",
  document: COMPANY_CNPJ,
  companyType: "LIMITED",
  email: "contato@casadaspanelas.com.br",
  mobilePhone: "11987654321",
  postalCode: "01001000",
  address: "Rua das Flores",
  addressNumber: "100",
  complement: "",
  province: "Centro",
  monthlyIncome: 500_000,
};

function openAccount(form: AsaasAccountForm) {
  return openSupplierAsaasAccount({
    supplierId: SUPPLIER_ID,
    userId: "user-1",
    actor: supplierActor,
    form,
  });
}

describe("openSupplierAsaasAccount under the contract sign-up rules", () => {
  beforeEach(() => {
    mocks.findAccount.mockResolvedValue(null);
    mocks.company.mockResolvedValue({ cnpj: COMPANY_CNPJ, legalName: "Olaria Cunha Ltda" });
    mocks.openAsaasAccount.mockResolvedValue({ protectedNow: true });
  });

  it("refuses a CNPJ other than the company data's before calling Asaas", async () => {
    mocks.signupRulesSince.mockResolvedValue(new Date("2026-11-21T12:00:00Z"));

    const opening = openAccount({ ...companyForm, document: "11444777000161" });

    await expect(opening).rejects.toThrow("Use o CNPJ dos Dados fiscais da empresa");
    expect(mocks.openAsaasAccount).not.toHaveBeenCalled();
  });

  it("refuses an MEI declared as such before calling Asaas", async () => {
    mocks.signupRulesSince.mockResolvedValue(new Date("2026-11-21T12:00:00Z"));

    const opening = openAccount({ ...companyForm, companyType: "MEI" });

    await expect(opening).rejects.toThrow("MEI não pode ser fornecedor");
    expect(mocks.openAsaasAccount).not.toHaveBeenCalled();
  });

  it("opens the account in the company data's CNPJ", async () => {
    mocks.signupRulesSince.mockResolvedValue(new Date("2026-11-21T12:00:00Z"));

    await expect(openAccount(companyForm)).resolves.toEqual({ protectedNow: true });
  });

  it("opens any CNPJ as before while the rules are off", async () => {
    mocks.signupRulesSince.mockResolvedValue(null);

    const opening = openAccount({ ...companyForm, document: "11444777000161" });

    await expect(opening).resolves.toEqual({ protectedNow: true });
  });
});
