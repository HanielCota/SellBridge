import { z } from "zod";
import type { MercadoPagoSettings } from "./mercado-pago-connection";

/**
 * The calls SellBridge makes to Mercado Pago, from its official docs:
 * OAuth https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation
 * Preferences https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro/preferences/create-preference/post
 * Marketplace fee https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace
 * Payments https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api-payments/get-payment/get
 * Fee details https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-api-payments/create-payment/post
 * Merchant orders https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro/merchant_orders/search-merchant-order/get
 */

const REQUEST_TIMEOUT_IN_MS = 10_000;
const MILLISECONDS_PER_SECOND = 1000;

export class MercadoPagoError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "MercadoPagoError";
    this.status = status;
  }

  /** Mercado Pago refused the credentials themselves (revoked, expired, wrong app). */
  get refusedCredentials(): boolean {
    return this.status === 400 || this.status === 401 || this.status === 403;
  }
}

export function isMercadoPagoError(error: unknown): error is MercadoPagoError {
  return error instanceof MercadoPagoError;
}

export interface MercadoPagoTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  /** The linked account's Mercado Pago id. */
  accountId: string;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  user_id: z.union([z.number().int(), z.string().min(1)]),
});

/** The consent page a supplier is sent to, to authorize SellBridge's marketplace application. */
export function mercadoPagoAuthorizationUrl(input: {
  settings: MercadoPagoSettings;
  state: string;
  redirectUri: string;
}): string {
  const url = new URL(`${input.settings.authUrl}/authorization`);
  url.searchParams.set("client_id", input.settings.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", input.state);
  url.searchParams.set("redirect_uri", input.redirectUri);
  return url.toString();
}

async function callMercadoPago(
  settings: MercadoPagoSettings,
  input: { path: string; method: "GET" | "POST"; accessToken?: string; body?: unknown },
): Promise<unknown> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (input.accessToken !== undefined) {
    headers.authorization = `Bearer ${input.accessToken}`;
  }
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  let response: Response;
  try {
    response = await fetch(`${settings.apiUrl}${input.path}`, {
      method: input.method,
      headers,
      body: input.body === undefined ? null : JSON.stringify(input.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_IN_MS),
    });
  } catch (error) {
    throw new MercadoPagoError(`Mercado Pago unreachable on ${input.path}: ${String(error)}`, null);
  }
  if (!response.ok) {
    throw new MercadoPagoError(
      `Mercado Pago answered ${response.status} on ${input.path}`,
      response.status,
    );
  }
  return response.json();
}

function tokensFrom(payload: unknown, path: string): MercadoPagoTokens {
  const parsed = tokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new MercadoPagoError(`Unexpected token response on ${path}`, null);
  }
  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    expiresAt: new Date(Date.now() + parsed.data.expires_in * MILLISECONDS_PER_SECOND),
    accountId: String(parsed.data.user_id),
  };
}

/** Trades the consent page's code for the supplier's tokens. */
export async function exchangeMercadoPagoCode(
  settings: MercadoPagoSettings,
  input: { code: string; redirectUri: string },
): Promise<MercadoPagoTokens> {
  const payload = await callMercadoPago(settings, {
    path: "/oauth/token",
    method: "POST",
    body: {
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      test_token: settings.testMode ? "true" : "false",
    },
  });
  return tokensFrom(payload, "/oauth/token");
}

/** Renews the supplier's tokens; every renewal returns a new refresh token, which replaces the old. */
export async function refreshMercadoPagoTokens(
  settings: MercadoPagoSettings,
  refreshToken: string,
): Promise<MercadoPagoTokens> {
  const payload = await callMercadoPago(settings, {
    path: "/oauth/token",
    method: "POST",
    body: {
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
  });
  return tokensFrom(payload, "/oauth/token");
}

/** How long a checkout takes payments, Pix included: a later click opens a new one. */
export const CHECKOUT_TTL_IN_MS = 30 * 60 * 1000;

export interface CheckoutRequest {
  title: string;
  amountCents: number;
  /** SellBridge's share, kept by Mercado Pago for the marketplace, in cents. */
  platformFeeCents: number;
  externalReference: string;
  returnUrl: string;
  /** Where Mercado Pago posts the payment notices; it must be HTTPS. */
  notificationUrl: string | null;
  /** Until when the checkout and its Pix code take payments. */
  expiresAt: Date;
}

const preferenceResponseSchema = z.object({
  id: z.string().min(1),
  init_point: z.url(),
  sandbox_init_point: z.url().optional(),
});

function reais(cents: number): number {
  return cents / 100;
}

/**
 * Creates the Checkout Pro preference with the supplier's own token, so the payment lands in the
 * supplier's account and Mercado Pago keeps `marketplace_fee` for SellBridge. Pix and card only:
 * boleto and lottery payments are left out, and the card is charged in one installment.
 */
export async function createMercadoPagoCheckout(
  settings: MercadoPagoSettings,
  input: { accessToken: string; checkout: CheckoutRequest },
): Promise<{ preferenceId: string; checkoutUrl: string }> {
  const { checkout } = input;
  const secureReturn = checkout.returnUrl.startsWith("https://");
  const body = {
    items: [
      {
        id: checkout.externalReference,
        title: checkout.title,
        quantity: 1,
        currency_id: "BRL",
        unit_price: reais(checkout.amountCents),
      },
    ],
    marketplace_fee: reais(checkout.platformFeeCents),
    external_reference: checkout.externalReference,
    back_urls: {
      success: checkout.returnUrl,
      pending: checkout.returnUrl,
      failure: checkout.returnUrl,
    },
    ...(secureReturn ? { auto_return: "approved" } : {}),
    ...(checkout.notificationUrl === null ? {} : { notification_url: checkout.notificationUrl }),
    payment_methods: {
      excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
      installments: 1,
    },
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: checkout.expiresAt.toISOString(),
    date_of_expiration: checkout.expiresAt.toISOString(),
  };
  const payload = await callMercadoPago(settings, {
    path: "/checkout/preferences",
    method: "POST",
    accessToken: input.accessToken,
    body,
  });
  const parsed = preferenceResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new MercadoPagoError("Unexpected preference response", null);
  }
  const testUrl = parsed.data.sandbox_init_point;
  const checkoutUrl = settings.testMode && testUrl !== undefined ? testUrl : parsed.data.init_point;
  if (!isMercadoPagoCheckoutUrl(checkoutUrl, settings)) {
    throw new MercadoPagoError("Checkout address outside Mercado Pago", null);
  }
  return { preferenceId: parsed.data.id, checkoutUrl };
}

/**
 * The browser is sent to this address: only Mercado Pago's own HTTPS hosts, or the host the API
 * itself is on (the browser tests' local stand-in; production pins the official API host).
 */
export function isMercadoPagoCheckoutUrl(address: string, settings: MercadoPagoSettings): boolean {
  const url = new URL(address);
  if (url.origin === new URL(settings.apiUrl).origin) {
    return true;
  }
  return url.protocol === "https:" && /(^|\.)mercadopago\.com(\.br)?$/.test(url.hostname);
}

const paymentResponseSchema = z.object({
  id: z.union([z.number().int(), z.string().min(1)]),
  status: z.string().min(1),
  external_reference: z.string().nullable().optional(),
  date_approved: z.string().nullable().optional(),
  transaction_amount: z.number(),
  payment_type_id: z.string().nullable().optional(),
  currency_id: z.string().nullable().optional(),
  collector_id: z
    .union([z.number().int(), z.string().min(1)])
    .nullable()
    .optional(),
  fee_details: z
    .array(z.object({ type: z.string(), amount: z.number() }))
    .nullable()
    .optional(),
});

/** The fee entry Mercado Pago documents as the marketplace's commission. */
const APPLICATION_FEE_TYPE = "application_fee";

export interface MercadoPagoPayment {
  id: string;
  status: string;
  externalReference: string | null;
  approvedAt: Date | null;
  amountCents: number;
  paymentMethod: string | null;
  currency: string | null;
  /** The Mercado Pago account the money went to. */
  collectorId: string | null;
  /** The marketplace commission kept from this payment, in cents (0 when there is none). */
  applicationFeeCents: number;
}

function centsFrom(amountInReais: number): number {
  return Math.round(amountInReais * 100);
}

function applicationFeeCentsFrom(
  feeDetails: readonly { type: string; amount: number }[] | null | undefined,
): number {
  if (feeDetails == null) {
    return 0;
  }
  return feeDetails
    .filter((fee) => fee.type === APPLICATION_FEE_TYPE)
    .reduce((total, fee) => total + centsFrom(fee.amount), 0);
}

function dateOrNull(value: string | null | undefined): Date | null {
  if (value == null) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

/** Reads a payment with the token of the account it was made to. */
export async function getMercadoPagoPayment(
  settings: MercadoPagoSettings,
  input: { accessToken: string; paymentId: string },
): Promise<MercadoPagoPayment> {
  const path = `/v1/payments/${encodeURIComponent(input.paymentId)}`;
  const payload = await callMercadoPago(settings, {
    path,
    method: "GET",
    accessToken: input.accessToken,
  });
  const parsed = paymentResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new MercadoPagoError(`Unexpected payment response on ${path}`, null);
  }
  return {
    id: String(parsed.data.id),
    status: parsed.data.status,
    externalReference: parsed.data.external_reference ?? null,
    approvedAt: dateOrNull(parsed.data.date_approved),
    amountCents: centsFrom(parsed.data.transaction_amount),
    paymentMethod: parsed.data.payment_type_id ?? null,
    currency: parsed.data.currency_id ?? null,
    collectorId: parsed.data.collector_id == null ? null : String(parsed.data.collector_id),
    applicationFeeCents: applicationFeeCentsFrom(parsed.data.fee_details),
  };
}

const paymentIdSchema = z.union([z.number().int(), z.string().min(1)]);

const merchantOrderSearchSchema = z.object({
  elements: z
    .array(
      z.object({
        preference_id: z.string().nullable().optional(),
        payments: z
          .array(z.object({ id: paymentIdSchema.nullable().optional() }))
          .nullable()
          .optional(),
      }),
    )
    .nullable()
    .optional(),
});

/**
 * The ids of the payments made through one Checkout Pro preference, read from its merchant
 * orders with the token of the account the preference belongs to.
 */
export async function listPreferencePaymentIds(
  settings: MercadoPagoSettings,
  input: { accessToken: string; preferenceId: string },
): Promise<string[]> {
  const path = `/merchant_orders/search?preference_id=${encodeURIComponent(input.preferenceId)}`;
  const payload = await callMercadoPago(settings, {
    path,
    method: "GET",
    accessToken: input.accessToken,
  });
  const parsed = merchantOrderSearchSchema.safeParse(payload);
  if (!parsed.success) {
    throw new MercadoPagoError("Unexpected merchant order search response", null);
  }
  const ids: string[] = [];
  for (const order of parsed.data.elements ?? []) {
    if (order.preference_id !== input.preferenceId) {
      continue;
    }
    for (const payment of order.payments ?? []) {
      if (payment.id != null) {
        ids.push(String(payment.id));
      }
    }
  }
  return ids;
}
