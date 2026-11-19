import { describe, expect, test } from "vitest";
import { createAsaasBillingClient, type AsaasCheckoutPayer } from "./subscriptions.ts";

interface SentRequest {
  method: string;
  url: string;
  body: unknown;
}

function clientAnswering(body: unknown) {
  const sent: SentRequest[] = [];
  const fetchImplementation = async (url: string, init?: RequestInit) => {
    const text = typeof init?.body === "string" ? init.body : null;
    sent.push({
      method: init?.method ?? "GET",
      url,
      body: text === null ? null : JSON.parse(text),
    });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const client = createAsaasBillingClient(
    { fetchImplementation, baseUrl: "https://asaas.test/v3" },
    "test-key",
  );
  return { client, sent };
}

const SUBSCRIPTION = {
  id: "sub_1",
  customer: "cus_1",
  status: "ACTIVE",
  value: 197,
  nextDueDate: "2026-12-19",
};

const PAYER: AsaasCheckoutPayer = {
  name: "Loja Teste",
  cpfCnpj: "24971563792",
  email: "loja@example.com",
  phone: "11991234567",
  address: "Avenida Paulista",
  addressNumber: "1000",
  complement: "",
  province: "Bela Vista",
  postalCode: "01310100",
  city: "São Paulo",
};

const CHECKOUT = {
  itemName: "SellBridge Pro",
  description: "Plano Pro, mensal",
  valueCents: 19_700,
  firstDueDate: "2026-11-19",
  externalReference: "tenant-a",
  successUrl: "https://app.test/assinatura?retorno=sucesso",
  cancelUrl: "https://app.test/assinatura?retorno=cancelado",
};

describe("Asaas billing client", () => {
  test("changes the monthly value of pending charges too", async () => {
    const { client, sent } = clientAnswering(SUBSCRIPTION);

    await client.changeSubscriptionValue("sub_1", { valueCents: 99_700, description: "Elite" });

    expect(sent[0]).toMatchObject({
      method: "PUT",
      url: "https://asaas.test/v3/subscriptions/sub_1",
      body: { value: 997, description: "Elite", updatePendingPayments: true },
    });
  });

  test("opens a Pix subscription billed monthly in reais", async () => {
    const { client, sent } = clientAnswering(SUBSCRIPTION);

    await client.createPixSubscription({
      customerId: "cus_1",
      valueCents: 9_700,
      firstDueDate: "2026-11-19",
      description: "SellBridge Start",
      externalReference: "tenant-a",
    });

    expect(sent[0]?.body).toMatchObject({
      billingType: "PIX",
      cycle: "MONTHLY",
      value: 97,
      nextDueDate: "2026-11-19",
    });
  });

  test("opens a recurring card checkout without any other way to pay", async () => {
    const { client, sent } = clientAnswering({ id: "chk_1", link: "https://asaas.test/c/1" });

    const checkout = await client.createRecurringCheckout({ ...CHECKOUT, payer: null });

    expect(checkout).toEqual({ checkoutId: "chk_1", url: "https://asaas.test/c/1" });
    expect(sent[0]?.body).toMatchObject({
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      items: [{ value: 197, quantity: 1 }],
      subscription: { cycle: "MONTHLY", nextDueDate: "2026-11-19" },
    });
    expect(sent[0]?.body).not.toHaveProperty("customerData");
  });

  test("fills the checkout with the payer's data when it is complete", async () => {
    const { client, sent } = clientAnswering({ id: "chk_1", link: "https://asaas.test/c/1" });

    await client.createRecurringCheckout({ ...CHECKOUT, payer: PAYER });

    expect(sent[0]?.body).toMatchObject({
      customerData: { cpfCnpj: "24971563792", postalCode: "01310100", phone: "11991234567" },
    });
  });

  test("drops a checkout link that is not a web address", async () => {
    const { client } = clientAnswering({ id: "chk_1", link: "javascript:alert(1)" });

    const checkout = await client.createRecurringCheckout({ ...CHECKOUT, payer: null });

    expect(checkout.url).toBeNull();
  });

  test("leaves the return out of a charge that has none", async () => {
    const { client, sent } = clientAnswering({
      id: "pay_1",
      status: "PENDING",
      value: 10,
      dueDate: "2026-11-19",
    });

    await client.createOneOffCharge({
      customerId: "cus_1",
      billingType: "PIX",
      valueCents: 1_000,
      dueDate: "2026-11-19",
      description: "Diferença",
      externalReference: "upgrade:tenant-a",
      successUrl: null,
    });

    expect(sent[0]?.body).not.toHaveProperty("callback");
  });

  test("keeps Asaas's e-mails on for a subscriber", async () => {
    const { client, sent } = clientAnswering({ id: "cus_1" });

    await client.createSubscriber({
      name: "Loja Teste",
      cpfCnpj: "24971563792",
      email: "loja@example.com",
      externalReference: "tenant-a",
    });

    expect(sent[0]?.body).toMatchObject({
      notificationDisabled: false,
      externalReference: "tenant-a",
    });
  });
});
