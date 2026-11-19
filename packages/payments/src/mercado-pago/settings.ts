import { booleanFlagEnvironmentSchema } from "@sellbridge/shared/environment";
import { z } from "zod";

const OFFICIAL_API_URL = "https://api.mercadopago.com";
const OFFICIAL_AUTH_URL = "https://auth.mercadopago.com";

export interface MercadoPagoSettings {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly webhookSecret: string;
  readonly testMode: boolean;
  readonly apiUrl: string;
  readonly authUrl: string;
}

/**
 * SellBridge's Mercado Pago marketplace application, as the web app and the worker read it from
 * their environment. Paying suppliers here is off until the three keys are set.
 */
export const mercadoPagoEnvironmentFields = {
  MERCADO_PAGO_CLIENT_ID: z.string().min(1).optional(),
  MERCADO_PAGO_CLIENT_SECRET: z.string().min(1).optional(),
  /** The application's secret signature, to check the `x-signature` of payment notices. */
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** Asks Mercado Pago for test credentials when a supplier links (test users only). */
  MERCADO_PAGO_TEST_MODE: booleanFlagEnvironmentSchema,
  /** Mercado Pago's hosts; only the browser tests point them to their local stand-in. */
  MERCADO_PAGO_API_URL: z.url().default(OFFICIAL_API_URL),
  MERCADO_PAGO_AUTH_URL: z.url().default(OFFICIAL_AUTH_URL),
};

export interface MercadoPagoEnvironment {
  MERCADO_PAGO_CLIENT_ID?: string | undefined;
  MERCADO_PAGO_CLIENT_SECRET?: string | undefined;
  MERCADO_PAGO_WEBHOOK_SECRET?: string | undefined;
  MERCADO_PAGO_TEST_MODE: boolean;
  MERCADO_PAGO_API_URL: string;
  MERCADO_PAGO_AUTH_URL: string;
}

/**
 * Production talks to Mercado Pago itself, never to a stand-in that could fake a payment, and
 * never asks for sandbox credentials: nothing on our side tells a sandbox payment from a real one.
 */
export function refuseMercadoPagoStandInsInProduction(
  value: MercadoPagoEnvironment,
  context: z.RefinementCtx,
): void {
  const hosts = [
    ["MERCADO_PAGO_API_URL", value.MERCADO_PAGO_API_URL, OFFICIAL_API_URL],
    ["MERCADO_PAGO_AUTH_URL", value.MERCADO_PAGO_AUTH_URL, OFFICIAL_AUTH_URL],
  ] as const;
  for (const [key, configured, official] of hosts) {
    if (configured === official) {
      continue;
    }
    context.addIssue({ code: "custom", path: [key], message: `deve ser ${official} em produção` });
  }
  if (value.MERCADO_PAGO_TEST_MODE) {
    context.addIssue({
      code: "custom",
      path: ["MERCADO_PAGO_TEST_MODE"],
      message: "deve ficar desligado em produção (só para usuários de teste)",
    });
  }
}

/**
 * Suppliers receive only through Asaas (Guilherme, 18/11/2026: "vai ser somente asaas para pagar",
 * "Só esconde"). The Mercado Pago code stays, switched off here: with this off, the web app and the
 * worker never create, read back or refund a Mercado Pago payment, even with the keys set.
 */
export const MERCADO_PAGO_SUPPLIER_PAYMENTS_ON = false;

/**
 * The application's settings, or null while the feature is off: switched off above, or any key
 * missing. `switchedOn` exists so the hidden code can still be tested.
 */
export function mercadoPagoSettingsFrom(
  environment: MercadoPagoEnvironment,
  switchedOn: boolean = MERCADO_PAGO_SUPPLIER_PAYMENTS_ON,
): MercadoPagoSettings | null {
  if (!switchedOn) {
    return null;
  }
  const clientId = environment.MERCADO_PAGO_CLIENT_ID;
  const clientSecret = environment.MERCADO_PAGO_CLIENT_SECRET;
  const webhookSecret = environment.MERCADO_PAGO_WEBHOOK_SECRET;
  if (clientId == null || clientSecret == null || webhookSecret == null) {
    return null;
  }
  return {
    clientId,
    clientSecret,
    webhookSecret,
    testMode: environment.MERCADO_PAGO_TEST_MODE,
    apiUrl: environment.MERCADO_PAGO_API_URL.replace(/\/+$/, ""),
    authUrl: environment.MERCADO_PAGO_AUTH_URL.replace(/\/+$/, ""),
  };
}
