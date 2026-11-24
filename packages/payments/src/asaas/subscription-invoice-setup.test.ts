import { createDatabase } from "@sellbridge/database/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const environment: Record<string, string | undefined> = {};
  return {
    environment,
    holder: vi.fn<() => Promise<unknown>>(),
    email: vi.fn<() => Promise<string | null>>(),
    lock: vi.fn<() => Promise<boolean>>(),
    warn: vi.fn<(...input: unknown[]) => void>(),
    error: vi.fn<(...input: unknown[]) => void>(),
    info: vi.fn<(...input: unknown[]) => void>(),
  };
});
vi.mock("@sellbridge/database/repositories", () => ({
  findBillingHolder: mocks.holder,
  findBillingOwnerEmail: mocks.email,
  tryLockSubscriptionInvoices: mocks.lock,
}));
vi.mock("@sellbridge/shared/logger", () => ({
  logger: { warn: mocks.warn, error: mocks.error, info: mocks.info },
}));

import { invoiceServiceFrom } from "./invoice-config.ts";
import {
  backfillSubscriptionInvoices,
  enableSubscriptionInvoices as enableWith,
  invoiceDescription,
  type InvoiceTarget,
} from "./subscription-invoice-setup.ts";
import { createAsaasBillingClient, type AsaasBillingClient } from "./subscriptions.ts";

const database = createDatabase("postgres://unused:unused@localhost:1/unused");
// No database runs here: the lock is mocked, so the transaction only has to call through.
vi.spyOn(database, "transaction").mockImplementation(async (operation) =>
  operation(Object.create(null)),
);

function contextOf(client: AsaasBillingClient) {
  return { database, client, setting: invoiceServiceFrom(mocks.environment) };
}

async function enableSubscriptionInvoices(client: AsaasBillingClient, target: InvoiceTarget) {
  return enableWith(contextOf(client), target);
}

interface SentRequest {
  method: string;
  path: string;
  body: unknown;
}

type Answer = { status: number; body: unknown };

/** Asaas at the HTTP boundary: answers by "METHOD /path", 404 for anything else. */
function asaasAnswering(answers: Record<string, Answer>) {
  const sent: SentRequest[] = [];
  const fetchImplementation = async (url: string, init?: RequestInit) => {
    const { pathname } = new URL(url);
    const path = pathname.replace("/v3", "");
    const method = init?.method ?? "GET";
    const text = typeof init?.body === "string" ? init.body : null;
    sent.push({ method, path, body: text === null ? null : JSON.parse(text) });
    const answer = answers[`${method} ${path}`] ?? { status: 404, body: null };
    const payload = answer.body === null ? "" : JSON.stringify(answer.body);
    return new Response(payload, { status: answer.status });
  };
  const client = createAsaasBillingClient(
    { fetchImplementation, baseUrl: "https://asaas.test/v3" },
    "test-key",
  );
  return { client, sent };
}

const CONFIGURED = {
  ASAAS_INVOICE_SERVICE_ID: "42",
  ASAAS_INVOICE_SERVICE_NAME: "Licenciamento de software",
  ASAAS_INVOICE_ISS_PERCENT: "2",
};

const TARGET = {
  tenantId: "tenant-a",
  subscriptionId: "sub_1",
  customerId: "cus_1",
  planId: "start",
};

const SETTINGS = { status: 200, body: { municipalServiceId: "42" } };

function charge(id: string, status: string) {
  return { id, status, value: 97, dueDate: "2026-11-23" };
}

const PAID_CARD_SUBSCRIPTION: Record<string, Answer> = {
  "PUT /customers/cus_1": { status: 200, body: { id: "cus_1" } },
  "POST /subscriptions/sub_1/invoiceSettings": SETTINGS,
  "GET /subscriptions/sub_1/payments": {
    status: 200,
    body: {
      hasMore: false,
      data: [charge("pay_paid", "CONFIRMED"), charge("pay_next", "PENDING")],
    },
  },
  "GET /subscriptions/sub_1/invoices": { status: 200, body: { data: [] } },
  "POST /invoices": {
    status: 200,
    body: { id: "inv_1", status: "SCHEDULED", payment: "pay_paid" },
  },
};

function writes(sent: SentRequest[]) {
  return sent
    .filter((request) => request.method !== "GET")
    .map((request) => `${request.method} ${request.path}`);
}

describe("enableSubscriptionInvoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mocks.environment)) delete mocks.environment[key];
    Object.assign(mocks.environment, CONFIGURED);
    mocks.lock.mockResolvedValue(true);
    mocks.email.mockResolvedValue("loja@example.com");
    mocks.holder.mockResolvedValue({
      address: {
        street: "Avenida Paulista",
        number: "1000",
        complement: "",
        neighborhood: "Bela Vista",
        cep: "01310100",
        city: "São Paulo",
      },
    });
  });

  it("names the plan in the invoice description", () => {
    expect(invoiceDescription("start")).toBe("Assinatura SellBridge, plano Start");
    expect(invoiceDescription("unknown")).toBe("Assinatura SellBridge");
  });

  it("stays off with a warning and calls nobody while the accountant's values are missing", async () => {
    for (const key of Object.keys(mocks.environment)) delete mocks.environment[key];
    const { client, sent } = asaasAnswering({});

    const outcome = await enableSubscriptionInvoices(client, TARGET);

    expect(outcome).toBe("off");
    expect(sent).toEqual([]);
    expect(mocks.warn).toHaveBeenCalledWith("billing.invoice_not_configured", {
      subscriptionId: "sub_1",
    });
  });

  it("reports half-set values as an error and calls nobody", async () => {
    mocks.environment.ASAAS_INVOICE_ISS_PERCENT = "2,5";
    const { client, sent } = asaasAnswering({});

    const outcome = await enableSubscriptionInvoices(client, TARGET);

    expect(outcome).toBe("invalid_config");
    expect(sent).toEqual([]);
    expect(mocks.error).toHaveBeenCalledWith(
      "billing.invoice_config_invalid",
      expect.objectContaining({ problemKey: "invoice-config" }),
    );
  });

  it("sets the address, the settings and the invoice of the charge paid before them", async () => {
    const { client, sent } = asaasAnswering(PAID_CARD_SUBSCRIPTION);

    const outcome = await enableSubscriptionInvoices(client, TARGET);

    expect(outcome).toBe("enabled");
    expect(writes(sent)).toEqual([
      "PUT /customers/cus_1",
      "POST /subscriptions/sub_1/invoiceSettings",
      "POST /invoices",
    ]);
    const settings = sent.find(
      (request) => request.method === "POST" && request.path.endsWith("/invoiceSettings"),
    );
    expect(settings?.body).toMatchObject({
      effectiveDatePeriod: "ON_PAYMENT_CONFIRMATION",
      observations: "Assinatura SellBridge, plano Start",
    });
    const invoice = sent.find((request) => request.path === "/invoices");
    expect(invoice?.body).toMatchObject({ payment: "pay_paid", value: 97 });
  });

  it("schedules no invoice for a paid charge that already has one", async () => {
    const { client, sent } = asaasAnswering({
      ...PAID_CARD_SUBSCRIPTION,
      "GET /subscriptions/sub_1/invoices": {
        status: 200,
        body: { data: [{ id: "inv_0", status: "AUTHORIZED", payment: "pay_paid" }] },
      },
    });

    await enableSubscriptionInvoices(client, TARGET);

    expect(writes(sent)).not.toContain("POST /invoices");
  });

  it("only refreshes the settings when the subscription already had them", async () => {
    const { client, sent } = asaasAnswering({
      ...PAID_CARD_SUBSCRIPTION,
      "GET /subscriptions/sub_1/invoiceSettings": SETTINGS,
    });

    const outcome = await enableSubscriptionInvoices(client, { ...TARGET, planId: "pro" });

    expect(outcome).toBe("enabled");
    expect(writes(sent)).toEqual([
      "PUT /customers/cus_1",
      "POST /subscriptions/sub_1/invoiceSettings",
    ]);
    expect(sent.some((request) => request.path.endsWith("/payments"))).toBe(false);
  });

  it("leaves the Asaas customer as it is when the account has no address saved", async () => {
    mocks.holder.mockResolvedValue({ address: null });
    const { client, sent } = asaasAnswering(PAID_CARD_SUBSCRIPTION);

    await enableSubscriptionInvoices(client, TARGET);

    expect(writes(sent)).not.toContain("PUT /customers/cus_1");
    expect(writes(sent)).toContain("POST /subscriptions/sub_1/invoiceSettings");
  });

  it("reports Asaas's refusal as an error with its reason and never throws", async () => {
    const reason = "Endereço do cliente incompleto.";
    const { client } = asaasAnswering({
      ...PAID_CARD_SUBSCRIPTION,
      "POST /subscriptions/sub_1/invoiceSettings": {
        status: 400,
        body: { errors: [{ code: "invalid_action", description: reason }] },
      },
    });

    const outcome = await enableSubscriptionInvoices(client, TARGET);

    expect(outcome).toBe("failed");
    expect(mocks.error).toHaveBeenCalledWith(
      "billing.invoice_settings_failed",
      expect.objectContaining({
        problemKey: "invoice-settings:sub_1",
        status: 400,
        codes: ["invalid_action"],
        issues: [reason],
      }),
    );
  });

  it("leaves the subscription to the run already setting it up", async () => {
    mocks.lock.mockResolvedValue(false);
    const { client, sent } = asaasAnswering(PAID_CARD_SUBSCRIPTION);

    const outcome = await enableSubscriptionInvoices(client, TARGET);

    expect(outcome).toBe("busy");
    expect(sent).toEqual([]);
  });
});

function subscription(id: string, status: string): Answer {
  return { status: 200, body: { id, customer: "cus_1", status, value: 97 } };
}

describe("backfillSubscriptionInvoices", () => {
  const ACCOUNTS = [
    { tenantId: "tenant-a", subscriptionId: "sub_1", plan: "start" },
    { tenantId: "tenant-b", subscriptionId: "sub_set", plan: "pro" },
    { tenantId: "tenant-c", subscriptionId: "sub_gone", plan: "pro" },
    { tenantId: "tenant-d", subscriptionId: null, plan: "start" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mocks.environment)) delete mocks.environment[key];
    Object.assign(mocks.environment, CONFIGURED);
    mocks.lock.mockResolvedValue(true);
    mocks.email.mockResolvedValue("loja@example.com");
    mocks.holder.mockResolvedValue({ address: null });
  });

  it("sets up only the active subscriptions still without settings", async () => {
    const { client, sent } = asaasAnswering({
      ...PAID_CARD_SUBSCRIPTION,
      "GET /subscriptions/sub_1": subscription("sub_1", "ACTIVE"),
      "GET /subscriptions/sub_set": subscription("sub_set", "ACTIVE"),
      "GET /subscriptions/sub_set/invoiceSettings": SETTINGS,
      "GET /subscriptions/sub_gone": subscription("sub_gone", "INACTIVE"),
    });

    const counts = await backfillSubscriptionInvoices(contextOf(client), ACCOUNTS);

    expect(counts).toEqual({ enabled: 1, already_set: 1, not_active: 1 });
    expect(writes(sent)).toEqual(["POST /subscriptions/sub_1/invoiceSettings", "POST /invoices"]);
  });

  it("keeps going after one subscription fails, reporting it", async () => {
    const { client } = asaasAnswering({
      ...PAID_CARD_SUBSCRIPTION,
      "GET /subscriptions/sub_1": { status: 500, body: null },
      "GET /subscriptions/sub_set": subscription("sub_set", "ACTIVE"),
      "GET /subscriptions/sub_set/invoiceSettings": SETTINGS,
      "GET /subscriptions/sub_gone": subscription("sub_gone", "INACTIVE"),
    });

    const counts = await backfillSubscriptionInvoices(contextOf(client), ACCOUNTS);

    expect(counts).toEqual({ failed: 1, already_set: 1, not_active: 1 });
    expect(mocks.error).toHaveBeenCalledWith(
      "billing.invoice_settings_failed",
      expect.objectContaining({ problemKey: "invoice-settings:sub_1", status: 500 }),
    );
  });

  it("stops at the first subscription while the accountant's values are missing", async () => {
    for (const key of Object.keys(mocks.environment)) delete mocks.environment[key];
    const { client } = asaasAnswering({
      "GET /subscriptions/sub_1": subscription("sub_1", "ACTIVE"),
      "GET /subscriptions/sub_set": subscription("sub_set", "ACTIVE"),
    });

    const counts = await backfillSubscriptionInvoices(contextOf(client), ACCOUNTS);

    expect(counts).toEqual({ off: 1 });
  });
});
