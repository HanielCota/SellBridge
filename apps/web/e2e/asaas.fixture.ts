import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { logger } from "@sellbridge/shared/logger";
import type { Plugin } from "vite";

/**
 * A local stand-in for Asaas (supplier accounts, Conta Escrow, charges, the hosted invoice page,
 * releases, refunds and the webhook notice), so the browser tests and the test site never reach
 * the real service or real money. API paths mirror the official ones under /__e2e/asaas/v3.
 * Test-only helpers live under /__e2e/asaas/test.
 */
export const ASAAS_FIXTURE_PREFIX = "/__e2e/asaas";
export const E2E_ASAAS_ENV = {
  ASAAS_API_KEY: "e2e-asaas-platform-key",
  ASAAS_WALLET_ID: "e2e-wallet-sellbridge",
  ASAAS_WEBHOOK_TOKEN: "e2e-asaas-webhook-token-0123456789abcdef",
};

const ACCOUNT_KEY_PREFIX = "e2e-asaas-key-";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

interface Account {
  id: string;
  walletId: string;
  escrowDays: number | null;
  webhookUrl: string;
  webhookToken: string;
  approval: "PENDING" | "AWAITING_APPROVAL" | "APPROVED";
}

interface Escrow {
  id: string;
  status: "ACTIVE" | "DONE";
  expirationDate: string;
  finishReason: string | null;
}

interface Charge {
  id: string;
  accountId: string;
  status: string;
  value: number;
  externalReference: string;
  description: string;
  successUrl: string;
  split: unknown;
  billingType: string;
  deleted: boolean;
  escrow: Escrow | null;
  refunds: { status: string; value: number }[];
}

const accounts = new Map<string, Account>();
const customers = new Map<string, { accountId: string; externalReference: string }>();
const charges = new Map<string, Charge>();

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function refuse(response: ServerResponse, status: number, description: string): void {
  json(response, status, { errors: [{ code: "invalid_action", description }] });
}

function html(response: ServerResponse, body: string): void {
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(`<!doctype html><html lang="pt-BR" data-hydrated>${body}</html>`);
}

function redirect(response: ServerResponse, location: string): void {
  response.writeHead(302, { location });
  response.end();
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text === "") {
    return {};
  }
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) {
    return {};
  }
  return Object.fromEntries(Object.entries(parsed));
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOf(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function keyOf(request: IncomingMessage): string {
  return textOf(request.headers.access_token);
}

/** The supplier account behind a stand-in key ("e2e-asaas-key-<account id>"). */
function accountOf(request: IncomingMessage): Account | null {
  const key = keyOf(request);
  if (!key.startsWith(ACCOUNT_KEY_PREFIX)) {
    return null;
  }
  return accounts.get(key.slice(ACCOUNT_KEY_PREFIX.length)) ?? null;
}

function isPlatform(request: IncomingMessage): boolean {
  return keyOf(request) === E2E_ASAAS_ENV.ASAAS_API_KEY;
}

function dayFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_IN_MS).toISOString().slice(0, 10);
}

function chargeBody(charge: Charge) {
  const invoice = new URL(`${ASAAS_FIXTURE_PREFIX}/fatura`, process.env.APP_URL);
  invoice.searchParams.set("id", charge.id);
  return {
    id: charge.id,
    status: charge.status,
    value: charge.value,
    netValue: charge.value,
    billingType: charge.billingType,
    externalReference: charge.externalReference,
    invoiceUrl: invoice.href,
    deleted: charge.deleted,
    escrow: charge.escrow,
    refunds: charge.refunds,
    split: charge.split,
  };
}

/** Posts the notice the way Asaas does, with the account webhook's token in the header. */
async function sendNotice(account: Account, event: string, extra: Record<string, unknown>) {
  try {
    await fetch(account.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "asaas-access-token": account.webhookToken },
      body: JSON.stringify({
        id: `evt_${randomUUID()}`,
        event,
        account: { id: account.id },
        ...extra,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    logger.warn("e2e.asaas_notice_failed", { error });
  }
}

async function createAccount(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!isPlatform(request)) {
    json(response, 401, {});
    return;
  }
  const body = await readJson(request);
  const [webhook] = Array.isArray(body.webhooks) ? body.webhooks : [];
  const webhookFields = recordOf(webhook);
  const account: Account = {
    id: `acc_${randomUUID()}`,
    walletId: `wallet_${randomUUID()}`,
    escrowDays: null,
    webhookUrl: textOf(webhookFields.url),
    webhookToken: textOf(webhookFields.authToken),
    approval: "PENDING",
  };
  accounts.set(account.id, account);
  json(response, 200, {
    id: account.id,
    walletId: account.walletId,
    apiKey: `${ACCOUNT_KEY_PREFIX}${account.id}`,
  });
}

async function protectAccount(
  request: IncomingMessage,
  accountId: string,
  response: ServerResponse,
): Promise<void> {
  const account = accounts.get(accountId);
  if (!isPlatform(request) || account === undefined) {
    json(response, 404, {});
    return;
  }
  const body = await readJson(request);
  account.escrowDays = numberOf(body.daysToExpire);
  json(response, 200, {
    enabled: body.enabled === true,
    daysToExpire: account.escrowDays,
    isFeePayer: true,
  });
}

async function customersEndpoint(
  request: IncomingMessage,
  url: URL,
  response: ServerResponse,
): Promise<void> {
  const account = accountOf(request);
  if (account === null) {
    json(response, 401, {});
    return;
  }
  if (request.method === "POST") {
    const body = await readJson(request);
    const id = `cus_${randomUUID()}`;
    customers.set(id, { accountId: account.id, externalReference: textOf(body.externalReference) });
    json(response, 200, { id });
    return;
  }
  const reference = url.searchParams.get("externalReference");
  const data = [...customers.entries()]
    .filter(
      ([, customer]) =>
        customer.accountId === account.id && customer.externalReference === reference,
    )
    .map(([id]) => ({ id }));
  json(response, 200, { data });
}

async function createCharge(account: Account, request: IncomingMessage, response: ServerResponse) {
  const body = await readJson(request);
  const charge: Charge = {
    id: `pay_${randomUUID()}`,
    accountId: account.id,
    status: "PENDING",
    value: numberOf(body.value),
    externalReference: textOf(body.externalReference),
    description: textOf(body.description),
    successUrl: textOf(recordOf(body.callback).successUrl),
    split: body.split,
    billingType: textOf(body.billingType),
    deleted: false,
    escrow: null,
    refunds: [],
  };
  charges.set(charge.id, charge);
  json(response, 200, chargeBody(charge));
}

async function chargesEndpoint(
  request: IncomingMessage,
  url: URL,
  response: ServerResponse,
): Promise<void> {
  const account = accountOf(request);
  if (account === null) {
    json(response, 401, {});
    return;
  }
  if (request.method === "POST") {
    await createCharge(account, request, response);
    return;
  }
  const reference = url.searchParams.get("externalReference");
  const data = [...charges.values()]
    .filter((charge) => charge.accountId === account.id && charge.externalReference === reference)
    .map(chargeBody);
  json(response, 200, { hasMore: false, data });
}

function ownCharge(request: IncomingMessage, chargeId: string): Charge | null {
  const account = accountOf(request);
  const charge = charges.get(chargeId);
  if (account === null || charge === undefined || charge.accountId !== account.id) {
    return null;
  }
  return charge;
}

function chargeAction(
  request: IncomingMessage,
  chargeId: string,
  action: string,
  response: ServerResponse,
): void {
  const charge = ownCharge(request, chargeId);
  if (charge === null) {
    json(response, 404, {});
    return;
  }
  if (action === "" && request.method === "DELETE") {
    deleteCharge(charge, response);
    return;
  }
  if (action === "/refund" && request.method === "POST") {
    refundCharge(charge, response);
    return;
  }
  if (action === "/escrow") {
    json(response, charge.escrow === null ? 404 : 200, charge.escrow ?? {});
    return;
  }
  json(response, 200, chargeBody(charge));
}

/** Charges are replaced, never changed in place. */
function saveCharge(charge: Charge, changes: Partial<Charge>): Charge {
  const saved = { ...charge, ...changes };
  charges.set(saved.id, saved);
  return saved;
}

function notify(charge: Charge, event: string): void {
  const account = accounts.get(charge.accountId);
  if (account !== undefined) {
    void sendNotice(account, event, { payment: chargeBody(charge) });
  }
}

function deleteCharge(charge: Charge, response: ServerResponse): void {
  if (charge.status !== "PENDING") {
    refuse(response, 400, "Só é possível remover cobranças aguardando pagamento.");
    return;
  }
  saveCharge(charge, { deleted: true });
  json(response, 200, { deleted: true, id: charge.id });
}

function refundCharge(charge: Charge, response: ServerResponse): void {
  if (charge.status !== "RECEIVED" && charge.status !== "CONFIRMED") {
    refuse(response, 400, "Esta cobrança não pode ser estornada.");
    return;
  }
  const escrow =
    charge.escrow === null
      ? null
      : { ...charge.escrow, status: "DONE" as const, finishReason: "PAYMENT_REFUNDED" };
  const refunded = saveCharge(charge, {
    status: "REFUNDED",
    refunds: [{ status: "DONE", value: charge.value }],
    escrow,
  });
  json(response, 200, chargeBody(refunded));
  notify(refunded, "PAYMENT_REFUNDED");
}

/** Like the real sandbox (18/11/2026): only SellBridge's key ends a guarantee; others get 404. */
function finishEscrow(request: IncomingMessage, escrowId: string, response: ServerResponse): void {
  const charge = isPlatform(request)
    ? [...charges.values()].find((candidate) => candidate.escrow?.id === escrowId)
    : undefined;
  const escrow = charge?.escrow ?? null;
  if (charge === undefined || escrow === null) {
    json(response, 404, {});
    return;
  }
  if (escrow.status !== "ACTIVE") {
    refuse(response, 400, "Esta garantia já foi encerrada.");
    return;
  }
  const released = saveCharge(charge, {
    escrow: { ...escrow, status: "DONE", finishReason: "REQUESTED_BY_CUSTOMER" },
  });
  json(response, 200, chargeBody(released));
}

/** Money received: Pix at once; a card only when the test says so (it settles later). */
function receive(charge: Charge, billingType: string): Charge {
  const escrowDays = accounts.get(charge.accountId)?.escrowDays ?? null;
  const escrow: Escrow | null =
    escrowDays === null
      ? null
      : {
          id: `esc_${randomUUID()}`,
          status: "ACTIVE",
          expirationDate: dayFromNow(escrowDays),
          finishReason: null,
        };
  const received = saveCharge(charge, { status: "RECEIVED", billingType, escrow });
  notify(received, "PAYMENT_RECEIVED");
  return received;
}

function confirmCard(charge: Charge): void {
  const confirmed = saveCharge(charge, { status: "CONFIRMED", billingType: "CREDIT_CARD" });
  notify(confirmed, "PAYMENT_CONFIRMED");
}

function invoicePage(url: URL, response: ServerResponse): void {
  const charge = charges.get(url.searchParams.get("id") ?? "");
  if (charge === undefined || charge.deleted) {
    response.writeHead(404);
    response.end("Cobrança não encontrada");
    return;
  }
  const choice = url.searchParams.get("pagar");
  if (charge.status === "PENDING" && choice === "pix") {
    receive(charge, "PIX");
    redirect(response, charge.successUrl);
    return;
  }
  if (charge.status === "PENDING" && choice === "cartao") {
    confirmCard(charge);
    redirect(response, charge.successUrl);
    return;
  }
  html(
    response,
    `<h1>Fatura de teste do Asaas</h1><p>${escape(charge.description)}</p><p>Total: ${money.format(charge.value)}</p><p>Situação: ${escape(charge.status)}</p><form method="get"><input type="hidden" name="id" value="${escape(charge.id)}"><button name="pagar" value="pix">Pagar com Pix</button><button name="pagar" value="cartao">Pagar com cartão</button></form>`,
  );
}

function documentsEndpoint(request: IncomingMessage, response: ServerResponse): void {
  const account = accountOf(request);
  if (account === null) {
    json(response, 401, {});
    return;
  }
  const page = new URL(`${ASAAS_FIXTURE_PREFIX}/documentos`, process.env.APP_URL);
  page.searchParams.set("conta", account.id);
  const data =
    account.approval === "PENDING"
      ? [
          {
            id: "doc_identity",
            status: "NOT_SENT",
            type: "IDENTIFICATION",
            onboardingUrl: page.href,
          },
        ]
      : [];
  json(response, 200, { data });
}

function statusEndpoint(request: IncomingMessage, response: ServerResponse): void {
  const account = accountOf(request);
  if (account === null) {
    json(response, 401, {});
    return;
  }
  json(response, 200, { general: account.approval, documentation: account.approval });
}

/** Asaas's document page: sending them gets the account approved at once in the stand-in. */
function documentsPage(url: URL, response: ServerResponse): void {
  const account = accounts.get(url.searchParams.get("conta") ?? "");
  if (account === undefined) {
    response.writeHead(404);
    response.end("Conta não encontrada");
    return;
  }
  if (url.searchParams.get("enviar") === "1") {
    account.approval = "APPROVED";
    void sendNotice(account, "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED", {
      accountStatus: { general: "APPROVED" },
    });
    html(response, "<h1>Documentos enviados</h1><p>Conta aprovada.</p>");
    return;
  }
  html(
    response,
    `<h1>Envio de documentos de teste do Asaas</h1><form method="get"><input type="hidden" name="conta" value="${escape(account.id)}"><button name="enviar" value="1">Enviar documentos</button></form>`,
  );
}

/** Test helpers: settle a card payment, or read every charge of a reference (duplicates too). */
function testHelper(path: string, url: URL, response: ServerResponse): void {
  if (path.startsWith("/test/receber/")) {
    const charge = charges.get(path.slice("/test/receber/".length));
    if (charge === undefined) {
      json(response, 404, {});
      return;
    }
    json(response, 200, chargeBody(receive(charge, charge.billingType)));
    return;
  }
  const reference = url.searchParams.get("externalReference");
  json(response, 200, {
    data: [...charges.values()]
      .filter((charge) => charge.externalReference === reference)
      .map(chargeBody),
  });
}

async function handleApi(
  request: IncomingMessage,
  url: URL,
  path: string,
  response: ServerResponse,
) {
  const segments = path.split("/").filter((segment) => segment !== "");
  const [resource, id, action] = segments;
  if (path === "/accounts" && request.method === "POST") return createAccount(request, response);
  if (resource === "accounts" && action === "escrow" && id !== undefined)
    return protectAccount(request, id, response);
  if (resource === "customers") return customersEndpoint(request, url, response);
  if (resource === "payments" && id === undefined) return chargesEndpoint(request, url, response);
  if (resource === "payments" && id !== undefined)
    return chargeAction(request, id, action === undefined ? "" : `/${action}`, response);
  if (resource === "escrow" && action === "finish" && id !== undefined)
    return finishEscrow(request, id, response);
  if (path === "/myAccount/documents") return documentsEndpoint(request, response);
  if (path === "/myAccount/status") return statusEndpoint(request, response);
  json(response, 404, {});
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", process.env.APP_URL);
  const path = url.pathname.slice(ASAAS_FIXTURE_PREFIX.length);
  if (path.startsWith("/v3/")) {
    await handleApi(request, url, path.slice("/v3".length), response);
    return;
  }
  if (path === "/fatura") {
    invoicePage(url, response);
    return;
  }
  if (path === "/documentos") {
    documentsPage(url, response);
    return;
  }
  if (path.startsWith("/test/")) {
    testHelper(path, url, response);
    return;
  }
  json(response, 404, {});
}

async function handleOrNext(
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
): Promise<void> {
  try {
    await handle(request, response);
  } catch (error) {
    next(error);
  }
}

export function asaasFixture(): Plugin {
  return {
    name: "sellbridge-e2e-asaas",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!(request.url ?? "").startsWith(ASAAS_FIXTURE_PREFIX)) {
          next();
          return;
        }
        void handleOrNext(request, response, next);
      });
    },
  };
}
