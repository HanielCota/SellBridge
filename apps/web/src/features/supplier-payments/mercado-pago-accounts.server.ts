import {
  mercadoPagoSettingsFrom,
  type MercadoPagoContext,
  type MercadoPagoSettings,
} from "@sellbridge/payments/mercado-pago";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { tokenCipher } from "@/lib/server/marketplaces";

export const MERCADO_PAGO_CALLBACK_PATH = "/api/integracoes/mercado-pago/retorno";
export const MERCADO_PAGO_WEBHOOK_PATH = "/api/webhooks/mercado-pago";

/** The application's settings, or null while paying suppliers here is off. */
export function mercadoPagoSettings(): MercadoPagoSettings | null {
  return mercadoPagoSettingsFrom(environment);
}

/** The web app's database, cipher and settings for the Mercado Pago steps, or null while off. */
export function mercadoPagoContext(): MercadoPagoContext | null {
  const settings = mercadoPagoSettings();
  if (settings === null) {
    return null;
  }
  return { database, cipher: tokenCipher, settings };
}

/** The redirect registered in the Mercado Pago application: it must match exactly. */
export function mercadoPagoRedirectUri(): string {
  return new URL(MERCADO_PAGO_CALLBACK_PATH, environment.APP_URL).toString();
}

/** Mercado Pago posts notices only to HTTPS; local development reads the return instead. */
export function mercadoPagoNotificationUrl(): string | null {
  const url = new URL(MERCADO_PAGO_WEBHOOK_PATH, environment.APP_URL);
  if (url.protocol !== "https:") {
    return null;
  }
  return url.toString();
}
