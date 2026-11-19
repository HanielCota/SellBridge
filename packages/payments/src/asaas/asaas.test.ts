import { describe, expect, test, vi } from "vitest";
import { AsaasError, isAsaasError } from "./http.ts";
import { asaasChargeState, chargesWithMoneyTaken } from "./charge-state.ts";
import { createAsaasAccountClient, createAsaasPlatformClient } from "./client.ts";
import { asaasDueDate, asaasValueFromCents, centsFromAsaasValue } from "./money.ts";
import { asaasPaymentSchema, type AsaasPayment } from "./schemas.ts";
import { isValidAsaasWebhookToken, readAsaasWebhookEvent } from "./webhook.ts";

const BASE_URL = "https://asaas.test/v3";
const WEBHOOK_TOKEN = "t".repeat(40);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Call = { url: string; init: RequestInit };

function recordingFetch(...responses: Response[]) {
  const calls: Call[] = [];
  const fetchImplementation = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async (url, init = {}) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (next === undefined) {
        throw new Error(`unexpected call to ${url}`);
      }
      return next;
    },
  );
  return {
    calls,
    http: { fetchImplementation, baseUrl: BASE_URL },
  };
}

function sentBody(call: Call | undefined): unknown {
  if (call === undefined || typeof call.init.body !== "string") {
    throw new Error("expected a JSON body");
  }
  return JSON.parse(call.init.body);
}

function sentHeader(call: Call | undefined, name: string): string | null {
  return new Headers(call?.init.headers).get(name);
}

function payment(overrides: Partial<AsaasPayment> = {}): AsaasPayment {
  return {
    id: "pay_1",
    status: "PENDING",
    value: 150.5,
    externalReference: "shipment-payment-1",
    invoiceUrl: "https://www.asaas.com/i/1",
    ...overrides,
  };
}

const newAccount = {
  name: "Fornecedor Teste Ltda",
  email: "financeiro@fornecedor.test",
  cpfCnpj: "11222333000181",
  birthDate: null,
  companyType: "LIMITED",
  mobilePhone: "11987654321",
  address: "Rua das Flores",
  addressNumber: "100",
  complement: null,
  province: "Centro",
  postalCode: "01001000",
  incomeValueCents: 5_000_000,
};

const webhookTarget = {
  url: "https://sellbridge.test/api/webhooks/asaas",
  email: "operacao@sellbridge.test",
  authToken: WEBHOOK_TOKEN,
};

describe("asaasPaymentSchema", () => {
  test("drops a payment link that is not a web address", () => {
    const parsed = asaasPaymentSchema.parse({
      id: "pay_1",
      status: "PENDING",
      value: 10,
      invoiceUrl: "javascript:alert(1)",
    });

    expect(parsed.invoiceUrl).toBeNull();
  });

  test("keeps a payment link on https", () => {
    const parsed = asaasPaymentSchema.parse({
      id: "pay_1",
      status: "PENDING",
      value: 10,
      invoiceUrl: "https://www.asaas.com/i/1",
    });

    expect(parsed.invoiceUrl).toBe("https://www.asaas.com/i/1");
  });
});

describe("asaas money", () => {
  test("sends cents as reais", () => {
    expect(asaasValueFromCents(15_050)).toBe(150.5);
  });

  test("reads reais back as whole cents", () => {
    expect(centsFromAsaasValue(150.29)).toBe(15_029);
  });

  test.each([-1, 1.5, Number.NaN])("refuses %s cents", (cents) => {
    expect(() => asaasValueFromCents(cents)).toThrow(RangeError);
  });

  test.each([-0.01, Number.POSITIVE_INFINITY, Number.NaN])("refuses an amount of %s", (value) => {
    expect(() => centsFromAsaasValue(value)).toThrow(RangeError);
  });

  test("counts the due date on the Brasília calendar", () => {
    const lateNightInBrasilia = new Date("2026-11-16T02:00:00Z");

    expect(asaasDueDate(lateNightInBrasilia, 0)).toBe("2026-11-15");
    expect(asaasDueDate(lateNightInBrasilia, 1)).toBe("2026-11-16");
  });
});

describe("createAsaasPlatformClient", () => {
  test("opens the supplier account with SellBridge's key and its webhook", async () => {
    const { calls, http } = recordingFetch(
      json(200, { id: "acc_1", walletId: "wallet_1", apiKey: "supplier-key" }),
    );

    const created = await createAsaasPlatformClient(http, "platform-key").createAccount(
      newAccount,
      webhookTarget,
    );

    expect(created).toEqual({ accountId: "acc_1", walletId: "wallet_1", apiKey: "supplier-key" });
    expect(calls[0]?.url).toBe(`${BASE_URL}/accounts`);
    expect(calls[0]?.init.method).toBe("POST");
    expect(sentHeader(calls[0], "access_token")).toBe("platform-key");
    expect(sentBody(calls[0])).toMatchObject({
      cpfCnpj: "11222333000181",
      companyType: "LIMITED",
      incomeValue: 50_000,
      webhooks: [
        {
          url: webhookTarget.url,
          authToken: WEBHOOK_TOKEN,
          enabled: true,
          interrupted: false,
          sendType: "SEQUENTIALLY",
        },
      ],
    });
    expect(sentBody(calls[0])).not.toHaveProperty("birthDate");
  });

  test("registers SellBridge as the account's site, so its charges can return there", async () => {
    const { calls, http } = recordingFetch(
      json(200, { id: "acc_1", walletId: "wallet_1", apiKey: "supplier-key" }),
    );

    await createAsaasPlatformClient(http, "platform-key").createAccount(newAccount, webhookTarget);

    expect(sentBody(calls[0])).toMatchObject({ site: new URL(webhookTarget.url).origin });
  });

  test("reports a missing account key as null", async () => {
    const { http } = recordingFetch(json(200, { id: "acc_1", walletId: "wallet_1" }));

    const created = await createAsaasPlatformClient(http, "platform-key").createAccount(
      newAccount,
      webhookTarget,
    );

    expect(created.apiKey).toBeNull();
  });

  test("protects the account with the supplier paying the fee", async () => {
    const { calls, http } = recordingFetch(
      json(200, { enabled: true, daysToExpire: 30, isFeePayer: true }),
    );

    await createAsaasPlatformClient(http, "platform-key").protectAccount("acc_1", 30);

    expect(calls[0]?.url).toBe(`${BASE_URL}/accounts/acc_1/escrow`);
    expect(sentBody(calls[0])).toEqual({ enabled: true, daysToExpire: 30, isFeePayer: true });
  });
});

describe("createAsaasAccountClient", () => {
  const charge = {
    customerId: "cus_1",
    payMethod: "PIX" as const,
    amountCents: 15_050,
    dueDate: "2026-11-17",
    description: "Pedido 123 · Fornecedor Teste",
    externalReference: "shipment-payment-1",
    platformWalletId: "wallet_platform",
    platformFeeCents: 752,
    successUrl: "https://sellbridge.test/pedidos/1",
  };

  test("creates the charge with SellBridge's share in the split", async () => {
    const { calls, http } = recordingFetch(json(200, payment()));

    await createAsaasAccountClient(http, "supplier-key").createCharge(charge);

    expect(sentHeader(calls[0], "access_token")).toBe("supplier-key");
    expect(sentBody(calls[0])).toEqual({
      customer: "cus_1",
      billingType: "PIX",
      value: 150.5,
      dueDate: "2026-11-17",
      description: "Pedido 123 · Fornecedor Teste",
      externalReference: "shipment-payment-1",
      split: [{ walletId: "wallet_platform", fixedValue: 7.52 }],
      callback: { successUrl: "https://sellbridge.test/pedidos/1", autoRedirect: true },
    });
  });

  test("asks only for the card when the reseller pays by card, never letting Asaas offer boleto", async () => {
    const { calls, http } = recordingFetch(json(200, payment()));

    await createAsaasAccountClient(http, "supplier-key").createCharge({
      ...charge,
      payMethod: "CREDIT_CARD",
    });

    expect(sentBody(calls[0])).toMatchObject({ billingType: "CREDIT_CARD" });
    expect(sentBody(calls[0])).not.toHaveProperty("installmentCount");
  });

  test("sends no split when SellBridge's fee is zero", async () => {
    const { calls, http } = recordingFetch(json(200, payment()));

    await createAsaasAccountClient(http, "supplier-key").createCharge({
      ...charge,
      platformFeeCents: 0,
    });

    expect(sentBody(calls[0])).toMatchObject({ split: [] });
  });

  test("never repeats a charge creation that failed on Asaas's side", async () => {
    const { calls, http } = recordingFetch(json(500, {}), json(200, payment()));

    const creation = createAsaasAccountClient(http, "supplier-key").createCharge(charge);

    await expect(creation).rejects.toSatisfy(isAsaasError);
    expect(calls).toHaveLength(1);
  });

  test("never repeats a release that failed on Asaas's side", async () => {
    const { calls, http } = recordingFetch(json(502, {}), json(200, payment()));

    const release = createAsaasPlatformClient(http, "platform-key").releaseEscrow("esc_1");

    await expect(release).rejects.toSatisfy(isAsaasError);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/escrow/esc_1/finish`);
  });

  test("looks charges up by SellBridge's reference", async () => {
    const { calls, http } = recordingFetch(
      json(200, { hasMore: false, data: [payment(), payment({ id: "pay_2" })] }),
    );

    const found = await createAsaasAccountClient(http, "supplier-key").findCharges("ref/1&x");

    expect(found.map((item) => item.id)).toEqual(["pay_1", "pay_2"]);
    expect(new URL(calls[0]?.url ?? "").searchParams.get("externalReference")).toBe("ref/1&x");
  });

  test("marks a write that failed on Asaas's side as possibly done", async () => {
    const { http } = recordingFetch(json(503, {}));

    const release = createAsaasPlatformClient(http, "platform-key").releaseEscrow("esc_1");

    await expect(release).rejects.toMatchObject({ status: 503, outcomeUnknown: true });
  });

  test("marks an unreachable Asaas as possibly done", async () => {
    const http = {
      baseUrl: BASE_URL,
      fetchImplementation: async () => Promise.reject(new TypeError("fetch failed")),
    };

    const creation = createAsaasAccountClient(http, "supplier-key").getCharge("pay_1");

    await expect(creation).rejects.toMatchObject({ status: null, outcomeUnknown: true });
  });

  test("keeps the parcel id in the query out of an unreachable error", async () => {
    const http = {
      baseUrl: BASE_URL,
      fetchImplementation: async () => Promise.reject(new TypeError("fetch failed")),
    };

    const search = createAsaasAccountClient(http, "supplier-key").findCharges("parcel-123");

    await expect(search).rejects.toThrow("Asaas unreachable on /v3/payments:");
    await expect(search).rejects.not.toThrow("parcel-123");
  });

  test("reports a refused key as an access problem", async () => {
    const { http } = recordingFetch(json(401, {}));

    const read = createAsaasAccountClient(http, "supplier-key").getCharge("pay_1");

    await expect(read).rejects.toMatchObject({ refusedCredentials: true });
  });

  test("keeps Asaas's own words for a refusal", async () => {
    const { http } = recordingFetch(
      json(400, { errors: [{ code: "invalid_value", description: "Valor inválido." }] }),
    );

    const refund = createAsaasAccountClient(http, "supplier-key").refundCharge(
      "pay_1",
      "Cancelado",
    );

    await expect(refund).rejects.toMatchObject({
      status: 400,
      codes: ["invalid_value"],
      issues: ["Valor inválido."],
      outcomeUnknown: false,
    });
    await expect(refund).rejects.toBeInstanceOf(AsaasError);
  });

  test("refuses an answer in an unexpected shape", async () => {
    const { http } = recordingFetch(json(200, { unexpected: true }));

    const read = createAsaasAccountClient(http, "supplier-key").getCharge("pay_1");

    await expect(read).rejects.toSatisfy(isAsaasError);
  });

  test("finds no customer when Asaas lists none", async () => {
    const { http } = recordingFetch(json(200, { data: [] }));

    const customerId = await createAsaasAccountClient(http, "supplier-key").findCustomerId(
      "tenant-1",
    );

    expect(customerId).toBeNull();
  });
});

describe("asaasChargeState", () => {
  test.each([
    ["PENDING", "pending", false],
    ["OVERDUE", "pending", false],
    ["AWAITING_RISK_ANALYSIS", "in_process", false],
    ["CONFIRMED", "approved", true],
    ["RECEIVED", "approved", true],
    ["REFUND_IN_PROGRESS", "approved", true],
    ["REFUNDED", "refunded", false],
    ["CHARGEBACK_REQUESTED", "charged_back", true],
    ["SOMETHING_NEW", "pending", false],
  ] as const)("keeps %s as %s", (status, expected, moneyTaken) => {
    const state = asaasChargeState(payment({ status }));

    expect(state.status).toBe(expected);
    expect(state.moneyTaken).toBe(moneyTaken);
  });

  test("keeps a removed charge as cancelled with no money taken", () => {
    const state = asaasChargeState(payment({ status: "RECEIVED", deleted: true }));

    expect(state.status).toBe("cancelled");
    expect(state.moneyTaken).toBe(false);
  });

  test("reads an active guarantee and its deadline in Brasília", () => {
    const state = asaasChargeState(
      payment({
        status: "RECEIVED",
        escrow: { id: "esc_1", status: "ACTIVE", expirationDate: "2026-12-25" },
      }),
    );

    expect(state.escrowId).toBe("esc_1");
    expect(state.escrow).toEqual({
      status: "active",
      expiresAt: new Date("2026-12-25T03:00:00Z"),
    });
  });

  test("treats an unknown guarantee status as ended", () => {
    const state = asaasChargeState(
      payment({ escrow: { id: "esc_1", status: "PAUSED", expirationDate: "2026-12-25 10:00:00" } }),
    );

    expect(state.escrow?.status).toBe("done");
  });

  test("refuses a guarantee without a usable deadline", () => {
    const undated = payment({
      escrow: { id: "esc_1", status: "ACTIVE", expirationDate: "soon" },
    });

    expect(() => asaasChargeState(undated)).toThrow(RangeError);
  });

  test("counts a refund as done only when every refund is done", () => {
    const pending = asaasChargeState(
      payment({ refunds: [{ status: "DONE" }, { status: "PENDING" }] }),
    );
    const done = asaasChargeState(payment({ refunds: [{ status: "DONE" }] }));
    const none = asaasChargeState(payment({ refunds: [] }));

    expect(pending.refundDone).toBe(false);
    expect(done.refundDone).toBe(true);
    expect(none.refundDone).toBe(false);
  });

  test("sees a refund Asaas is still making, by status or by an unfinished refund", () => {
    const byStatus = asaasChargeState(payment({ status: "REFUND_IN_PROGRESS" }));
    const byRefund = asaasChargeState(payment({ refunds: [{ status: "PENDING" }] }));
    const finished = asaasChargeState(payment({ refunds: [{ status: "DONE" }] }));

    expect(byStatus.refundInProgress).toBe(true);
    expect(byRefund.refundInProgress).toBe(true);
    expect(finished.refundInProgress).toBe(false);
  });

  test("tells a guarantee ended by a refund from one released to the supplier", () => {
    const escrow = { id: "esc_1", status: "DONE", expirationDate: "2026-12-20" };

    const refunded = asaasChargeState(
      payment({ escrow: { ...escrow, finishReason: "PAYMENT_REFUNDED" } }),
    );
    const released = asaasChargeState(
      payment({ escrow: { ...escrow, finishReason: "REQUESTED_BY_CUSTOMER" } }),
    );

    expect(refunded.escrowEndedWithoutRelease).toBe(true);
    expect(released.escrowEndedWithoutRelease).toBe(false);
  });
});

describe("chargesWithMoneyTaken", () => {
  test("finds the second paid charge of a parcel", () => {
    const charges = [
      payment({ id: "pay_1", status: "RECEIVED" }),
      payment({ id: "pay_2", status: "CONFIRMED" }),
      payment({ id: "pay_3", status: "PENDING" }),
      payment({ id: "pay_4", status: "REFUNDED" }),
    ];

    const taken = chargesWithMoneyTaken(charges);

    expect(taken.map((charge) => charge.id)).toEqual(["pay_1", "pay_2"]);
  });
});

describe("isValidAsaasWebhookToken", () => {
  test("accepts SellBridge's token", () => {
    expect(isValidAsaasWebhookToken(WEBHOOK_TOKEN, WEBHOOK_TOKEN)).toBe(true);
  });

  test.each([null, "", "wrong-token", `${WEBHOOK_TOKEN}x`])("refuses %s", (received) => {
    expect(isValidAsaasWebhookToken(received, WEBHOOK_TOKEN)).toBe(false);
  });

  test("refuses everything while the configured token is too short", () => {
    expect(isValidAsaasWebhookToken("short", "short")).toBe(false);
  });
});

describe("readAsaasWebhookEvent", () => {
  test("reads a payment notice and ignores unknown fields", () => {
    const event = readAsaasWebhookEvent({
      id: "evt_1",
      event: "PAYMENT_RECEIVED",
      dateCreated: "2026-11-16 10:00:00",
      account: { id: "acc_1", ownerId: null },
      payment: { id: "pay_1", value: 10, somethingNew: true },
    });

    expect(event).toEqual({
      kind: "payment",
      eventId: "evt_1",
      paymentId: "pay_1",
      accountId: "acc_1",
    });
  });

  test("reads an account approval notice", () => {
    const event = readAsaasWebhookEvent({
      id: "evt_2",
      event: "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED",
      account: { id: "acc_1" },
      accountStatus: { general: "APPROVED" },
    });

    expect(event).toEqual({ kind: "account_status", eventId: "evt_2", accountId: "acc_1" });
  });

  test("ignores an event SellBridge does not use", () => {
    const event = readAsaasWebhookEvent({ id: "evt_3", event: "TRANSFER_DONE", transfer: {} });

    expect(event).toEqual({ kind: "ignored", eventId: "evt_3", event: "TRANSFER_DONE" });
  });

  test.each([null, "text", { event: "PAYMENT_RECEIVED" }, { id: "", event: "PAYMENT_RECEIVED" }])(
    "refuses a body that is not a notice: %j",
    (body) => {
      expect(readAsaasWebhookEvent(body)).toBeNull();
    },
  );
});
