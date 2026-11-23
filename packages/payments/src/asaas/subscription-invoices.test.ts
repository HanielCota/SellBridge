import { describe, expect, test } from "vitest";
import { createAsaasBillingClient } from "./subscriptions.ts";
import {
  chargeInvoiceBody,
  subscriptionInvoiceSettingsBody,
  type AsaasInvoiceService,
  type AsaasInvoiceTaxes,
} from "./subscription-invoices.ts";

interface SentRequest {
  method: string;
  url: string;
  body: unknown;
}

function clientAnswering(status: number, body: unknown) {
  const sent: SentRequest[] = [];
  const fetchImplementation = async (url: string, init?: RequestInit) => {
    const text = typeof init?.body === "string" ? init.body : null;
    sent.push({
      method: init?.method ?? "GET",
      url,
      body: text === null ? null : JSON.parse(text),
    });
    return new Response(body === null ? "" : JSON.stringify(body), { status });
  };
  const client = createAsaasBillingClient(
    { fetchImplementation, baseUrl: "https://asaas.test/v3" },
    "test-key",
  );
  return { client, sent };
}

const SIMPLES_TAXES: AsaasInvoiceTaxes = {
  retainIss: false,
  issPercent: 2,
  pisPercent: 0,
  cofinsPercent: 0,
  csllPercent: 0,
  inssPercent: 0,
  irPercent: 0,
  nbsCode: null,
  pisCofinsTaxStatus: null,
  operationPisPercent: null,
  operationCofinsPercent: null,
};

const BY_ID: AsaasInvoiceService = {
  service: { kind: "id", id: "42", name: "Licenciamento de software" },
  taxes: SIMPLES_TAXES,
};

const SETTINGS_ANSWER = {
  municipalServiceId: "42",
  municipalServiceCode: null,
  invoiceCreationPeriod: "ON_PAYMENT_CONFIRMATION",
};

describe("subscription invoice settings body", () => {
  test("issues on payment confirmation with the service id, its name and the plan", () => {
    const body = subscriptionInvoiceSettingsBody(BY_ID, "Assinatura SellBridge, plano Start");

    expect(body).toEqual({
      municipalServiceId: "42",
      municipalServiceName: "Licenciamento de software",
      effectiveDatePeriod: "ON_PAYMENT_CONFIRMATION",
      observations: "Assinatura SellBridge, plano Start",
      taxes: { retainIss: false, iss: 2, pis: 0, cofins: 0, csll: 0, inss: 0, ir: 0 },
    });
  });

  test("sends the municipal code instead of the id when the city has no service list", () => {
    const byCode: AsaasInvoiceService = {
      service: { kind: "code", code: "1.03", name: "Processamento de dados" },
      taxes: SIMPLES_TAXES,
    };

    const body = subscriptionInvoiceSettingsBody(byCode, "Assinatura SellBridge");

    expect(body).toMatchObject({
      municipalServiceCode: "1.03",
      municipalServiceName: "Processamento de dados",
    });
    expect(body).not.toHaveProperty("municipalServiceId");
  });

  test("adds the PIS/COFINS status and operation rates only outside Simples Nacional", () => {
    const regular: AsaasInvoiceService = {
      ...BY_ID,
      taxes: {
        ...SIMPLES_TAXES,
        nbsCode: "1.1502.10.00",
        pisCofinsTaxStatus: "STANDARD_TAXABLE_OPERATION",
        operationPisPercent: 0.65,
        operationCofinsPercent: 3,
      },
    };

    const body = subscriptionInvoiceSettingsBody(regular, "Assinatura SellBridge");

    expect(body.taxes).toMatchObject({
      nbsCode: "1.1502.10.00",
      pisCofinsTaxStatus: "STANDARD_TAXABLE_OPERATION",
      operationPis: 0.65,
      operationCofins: 3,
    });
    expect(subscriptionInvoiceSettingsBody(BY_ID, "x").taxes).not.toHaveProperty(
      "pisCofinsTaxStatus",
    );
  });
});

describe("charge invoice body", () => {
  test("schedules the paid charge's invoice for its value, with nothing deducted", () => {
    const body = chargeInvoiceBody(BY_ID, {
      chargeId: "pay_1",
      value: 97,
      effectiveDate: "2026-11-23",
      description: "Assinatura SellBridge, plano Start",
    });

    expect(body).toMatchObject({
      payment: "pay_1",
      serviceDescription: "Assinatura SellBridge, plano Start",
      observations: "Assinatura SellBridge, plano Start",
      value: 97,
      deductions: 0,
      effectiveDate: "2026-11-23",
      municipalServiceId: "42",
      municipalServiceName: "Licenciamento de software",
    });
  });
});

describe("Asaas invoice calls", () => {
  test("reads no settings when Asaas answers 404", async () => {
    const { client, sent } = clientAnswering(404, null);

    const settings = await client.getSubscriptionInvoiceSettings("sub_1");

    expect(settings).toBeNull();
    expect(sent[0]).toMatchObject({
      method: "GET",
      url: "https://asaas.test/v3/subscriptions/sub_1/invoiceSettings",
    });
  });

  test("rethrows other refusals when reading the settings", async () => {
    const { client } = clientAnswering(401, { errors: [{ code: "invalid_access_token" }] });

    await expect(client.getSubscriptionInvoiceSettings("sub_1")).rejects.toMatchObject({
      status: 401,
    });
  });

  test("posts the settings to the subscription", async () => {
    const { client, sent } = clientAnswering(200, SETTINGS_ANSWER);

    await client.saveSubscriptionInvoiceSettings("sub_1", {
      service: BY_ID,
      description: "Assinatura SellBridge, plano Pro",
    });

    expect(sent[0]).toMatchObject({
      method: "POST",
      url: "https://asaas.test/v3/subscriptions/sub_1/invoiceSettings",
      body: { observations: "Assinatura SellBridge, plano Pro" },
    });
  });

  test("keeps Asaas's reason when it refuses the settings", async () => {
    const reason = "Endereço do cliente incompleto.";
    const { client } = clientAnswering(400, {
      errors: [{ code: "invalid_action", description: reason }],
    });

    await expect(
      client.saveSubscriptionInvoiceSettings("sub_1", { service: BY_ID, description: "x" }),
    ).rejects.toMatchObject({ status: 400, codes: ["invalid_action"], issues: [reason] });
  });

  test("updates the customer's e-mail and address", async () => {
    const { client, sent } = clientAnswering(200, { id: "cus_1" });

    await client.updateSubscriberContact("cus_1", {
      email: "loja@example.com",
      address: "Avenida Paulista",
      addressNumber: "1000",
      complement: "",
      province: "Bela Vista",
      postalCode: "01310100",
    });

    expect(sent[0]).toMatchObject({
      method: "PUT",
      url: "https://asaas.test/v3/customers/cus_1",
      body: { email: "loja@example.com", postalCode: "01310100" },
    });
  });

  test("lists the subscription's invoices with the charge each one is for", async () => {
    const { client } = clientAnswering(200, {
      data: [{ id: "inv_1", status: "SCHEDULED", payment: "pay_1" }],
    });

    const invoices = await client.listSubscriptionInvoices("sub_1");

    expect(invoices).toEqual([{ id: "inv_1", status: "SCHEDULED", payment: "pay_1" }]);
  });
});
