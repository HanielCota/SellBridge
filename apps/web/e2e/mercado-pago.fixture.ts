import { randomInt, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { logger } from "@sellbridge/shared/logger";
import type { Plugin } from "vite";
import { mercadoPagoSignatureFor } from "../src/features/supplier-payments/mercado-pago-signature.ts";

/**
 * A local stand-in for Mercado Pago (consent page, tokens, Checkout Pro, payments and the signed
 * notice), so the browser tests and the test site never reach the real service or real money.
 * Its paths mirror the official ones under /__e2e/mercado-pago/{auth,api}.
 */
export const MERCADO_PAGO_FIXTURE_PREFIX = "/__e2e/mercado-pago";
export const E2E_MERCADO_PAGO_ENV = {
  MERCADO_PAGO_CLIENT_ID: "e2e-mercado-pago-client",
  MERCADO_PAGO_CLIENT_SECRET: "e2e-mercado-pago-secret",
  MERCADO_PAGO_WEBHOOK_SECRET: "e2e-mercado-pago-signature",
};

interface Preference {
  id: string;
  accountId: string;
  title: string;
  amount: number;
  fee: number;
  externalReference: string;
  returnUrl: string;
}

interface Payment {
  id: string;
  accountId: string;
  status: string;
  externalReference: string;
  amount: number;
  approvedAt: string | null;
}

const accountsByCode = new Map<string, string>();
const preferences = new Map<string, Preference>();
const payments = new Map<string, Payment>();

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function html(response: ServerResponse, body: string): void {
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(`<!doctype html><html lang="pt-BR" data-hydrated>${body}</html>`);
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

/** The Mercado Pago account behind a stand-in token ("TEST-<account id>"). */
function accountOf(request: IncomingMessage): string | null {
  const header = request.headers.authorization ?? "";
  const match = /^Bearer TEST-(\d+)$/.exec(header);
  return match?.[1] ?? null;
}

function consentPage(url: URL, response: ServerResponse): void {
  const state = url.searchParams.get("state") ?? "";
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  if (url.searchParams.get("authorize") === "1") {
    const code = `e2e-code-${randomUUID()}`;
    accountsByCode.set(code, String(randomInt(100_000_000, 999_999_999)));
    const callback = new URL(redirectUri);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", state);
    response.writeHead(302, { location: callback.href });
    response.end();
    return;
  }
  html(
    response,
    `<h1>Mercado Pago de teste</h1><p>O SellBridge quer receber pagamentos em seu nome.</p><form method="get"><input type="hidden" name="state" value="${escape(state)}"><input type="hidden" name="redirect_uri" value="${escape(redirectUri)}"><input type="hidden" name="authorize" value="1"><button>Autorizar</button></form>`,
  );
}

async function tokenEndpoint(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJson(request);
  if (body.client_secret !== E2E_MERCADO_PAGO_ENV.MERCADO_PAGO_CLIENT_SECRET) {
    json(response, 401, { message: "invalid client" });
    return;
  }
  const accountId =
    body.grant_type === "authorization_code"
      ? accountsByCode.get(textOf(body.code))
      : /^TG-(\d+)$/.exec(textOf(body.refresh_token))?.[1];
  if (accountId === undefined) {
    json(response, 400, { message: "invalid_grant" });
    return;
  }
  accountsByCode.delete(textOf(body.code));
  json(response, 200, {
    access_token: `TEST-${accountId}`,
    token_type: "bearer",
    expires_in: 15_552_000,
    scope: "offline_access read write",
    user_id: Number(accountId),
    refresh_token: `TG-${accountId}`,
  });
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOf(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

async function createPreference(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const accountId = accountOf(request);
  if (accountId === null) {
    json(response, 401, { message: "unauthorized" });
    return;
  }
  const body = await readJson(request);
  const items = Array.isArray(body.items) ? body.items : [];
  const [item] = items;
  const itemFields =
    typeof item === "object" && item !== null ? Object.fromEntries(Object.entries(item)) : {};
  const backUrls =
    typeof body.back_urls === "object" && body.back_urls !== null
      ? Object.fromEntries(Object.entries(body.back_urls))
      : {};
  const preference: Preference = {
    id: `e2e-pref-${randomUUID()}`,
    accountId,
    title: textOf(itemFields.title),
    amount: numberOf(itemFields.unit_price),
    fee: numberOf(body.marketplace_fee),
    externalReference: textOf(body.external_reference),
    returnUrl: textOf(backUrls.success),
  };
  preferences.set(preference.id, preference);
  const checkout = new URL(`${MERCADO_PAGO_FIXTURE_PREFIX}/checkout`, process.env.APP_URL);
  checkout.searchParams.set("pref", preference.id);
  json(response, 201, {
    id: preference.id,
    init_point: checkout.href,
    collector_id: Number(accountId),
  });
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function checkoutPage(url: URL, response: ServerResponse): void {
  const preference = preferences.get(url.searchParams.get("pref") ?? "");
  if (preference === undefined) {
    response.writeHead(404);
    response.end("Preferência não encontrada");
    return;
  }
  const outcome = url.searchParams.get("pagar");
  if (outcome === "pix" || outcome === "recusar") {
    finishCheckout(preference, outcome, response);
    return;
  }
  html(
    response,
    `<h1>Checkout de teste do Mercado Pago</h1><p>${escape(preference.title)}</p><p>Total: ${money.format(preference.amount)}</p><p>Taxa do marketplace: ${money.format(preference.fee)}</p><form method="get"><input type="hidden" name="pref" value="${escape(preference.id)}"><button name="pagar" value="pix">Pagar com Pix</button><button name="pagar" value="recusar">Recusar cartão</button></form>`,
  );
}

function finishCheckout(preference: Preference, outcome: string, response: ServerResponse): void {
  const approved = outcome === "pix";
  const payment: Payment = {
    id: String(randomInt(1_000_000_000, 9_999_999_999)),
    accountId: preference.accountId,
    status: approved ? "approved" : "rejected",
    externalReference: preference.externalReference,
    amount: preference.amount,
    approvedAt: approved ? new Date().toISOString() : null,
  };
  payments.set(payment.id, payment);
  void sendNotice(payment);
  const back = new URL(preference.returnUrl);
  back.searchParams.set("payment_id", payment.id);
  back.searchParams.set("status", payment.status);
  back.searchParams.set("external_reference", payment.externalReference);
  back.searchParams.set("preference_id", preference.id);
  response.writeHead(302, { location: back.href });
  response.end();
}

/** Posts the signed notice the way Mercado Pago does, a moment after the payment. */
async function sendNotice(payment: Payment): Promise<void> {
  const requestId = randomUUID();
  const ts = String(Date.now());
  const url = new URL("/api/webhooks/mercado-pago", process.env.APP_URL);
  url.searchParams.set("data.id", payment.id);
  url.searchParams.set("type", "payment");
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "x-signature": mercadoPagoSignatureFor({
          secret: E2E_MERCADO_PAGO_ENV.MERCADO_PAGO_WEBHOOK_SECRET,
          dataId: payment.id,
          requestId,
          ts,
        }),
      },
      body: JSON.stringify({
        type: "payment",
        action: "payment.updated",
        user_id: Number(payment.accountId),
        data: { id: payment.id },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    logger.warn("e2e.mercado_pago_notice_failed", { error });
  }
}

function paymentEndpoint(request: IncomingMessage, url: URL, response: ServerResponse): void {
  const accountId = accountOf(request);
  const payment = payments.get(url.pathname.split("/").at(-1) ?? "");
  if (accountId === null || payment === undefined || payment.accountId !== accountId) {
    json(response, 404, { message: "payment not found" });
    return;
  }
  json(response, 200, {
    id: Number(payment.id),
    status: payment.status,
    external_reference: payment.externalReference,
    date_approved: payment.approvedAt,
    transaction_amount: payment.amount,
    payment_type_id: "bank_transfer",
  });
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  const url = new URL(request.url ?? "/", process.env.APP_URL);
  const path = url.pathname.slice(MERCADO_PAGO_FIXTURE_PREFIX.length);
  if (path === "/auth/authorization") {
    consentPage(url, response);
    return true;
  }
  if (path === "/api/oauth/token" && request.method === "POST") {
    await tokenEndpoint(request, response);
    return true;
  }
  if (path === "/api/checkout/preferences" && request.method === "POST") {
    await createPreference(request, response);
    return true;
  }
  if (path === "/checkout") {
    checkoutPage(url, response);
    return true;
  }
  if (path.startsWith("/api/v1/payments/")) {
    paymentEndpoint(request, url, response);
    return true;
  }
  return false;
}

async function handleOrNext(
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
): Promise<void> {
  try {
    const handled = await handle(request, response);
    if (!handled) next();
  } catch (error) {
    next(error);
  }
}

export function mercadoPagoFixture(): Plugin {
  return {
    name: "sellbridge-e2e-mercado-pago",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!(request.url ?? "").startsWith(MERCADO_PAGO_FIXTURE_PREFIX)) {
          next();
          return;
        }
        void handleOrNext(request, response, next);
      });
    },
  };
}
