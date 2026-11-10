import {
  applyProviderPayment,
  findShipmentPaymentById,
  markSupplierPaymentAccountError,
  rotatePaymentAccountTokens,
  type ShipmentPayment,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import { shipmentPaymentStatusFrom } from "@sellbridge/shared/shipment-payments";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { tokenCipher } from "@/lib/server/marketplaces";
import {
  getMercadoPagoPayment,
  isMercadoPagoError,
  refreshMercadoPagoTokens,
  type MercadoPagoPayment,
} from "./mercado-pago-client.server";
import { mercadoPagoSettingsFrom, type MercadoPagoSettings } from "./mercado-pago-connection";

/** Tokens last 180 days; they are renewed when a week or less is left. */
const REFRESH_BEFORE_EXPIRY_IN_MS = 7 * 24 * 60 * 60 * 1000;

export const MERCADO_PAGO_CALLBACK_PATH = "/api/integracoes/mercado-pago/retorno";
export const MERCADO_PAGO_WEBHOOK_PATH = "/api/webhooks/mercado-pago";

/** The application's settings, or null while paying suppliers here is off. */
export function mercadoPagoSettings(): MercadoPagoSettings | null {
  return mercadoPagoSettingsFrom(environment);
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

export class PaymentAccountUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentAccountUnavailableError";
  }
}

/**
 * The supplier's access token, renewed first when it is close to expiring. A token Mercado Pago
 * refuses marks the account in error, so the supplier sees "Ligar de novo".
 *
 * @throws {PaymentAccountUnavailableError} When the account is not linked or was refused.
 */
export async function supplierAccessToken(
  settings: MercadoPagoSettings,
  account: SupplierPaymentAccount,
): Promise<string> {
  if (account.status !== "connected" || account.accessTokenEnc === null) {
    throw new PaymentAccountUnavailableError(`Payment account ${account.id} is not linked`);
  }
  const expiresAt = account.expiresAt?.getTime() ?? 0;
  if (expiresAt - Date.now() > REFRESH_BEFORE_EXPIRY_IN_MS || account.refreshTokenEnc === null) {
    return tokenCipher.decrypt(account.accessTokenEnc);
  }
  try {
    const tokens = await refreshMercadoPagoTokens(
      settings,
      tokenCipher.decrypt(account.refreshTokenEnc),
    );
    await rotatePaymentAccountTokens(database, {
      accountId: account.id,
      previousRefreshTokenEnc: account.refreshTokenEnc,
      tokens: {
        accessTokenEnc: tokenCipher.encrypt(tokens.accessToken),
        refreshTokenEnc: tokenCipher.encrypt(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
      },
    });
    logger.info("mercado_pago.tokens_refreshed", { supplierId: account.supplierId });
    return tokens.accessToken;
  } catch (error) {
    if (isMercadoPagoError(error) && error.refusedCredentials) {
      await markSupplierPaymentAccountError(database, {
        accountId: account.id,
        lastError: "refresh_refused",
      });
      throw new PaymentAccountUnavailableError(`Mercado Pago refused account ${account.id}`);
    }
    throw error;
  }
}

/** What syncing a payment did, for the logs and the tests. */
export type PaymentSyncResult =
  { kind: "applied"; payment: ShipmentPayment } | { kind: "ignored"; reason: string };

const externalReferenceSchema = z.uuid();

/** Why a payment read back from Mercado Pago does not settle this parcel, or null when it does. */
function mismatchReason(
  remote: MercadoPagoPayment,
  local: ShipmentPayment,
  account: SupplierPaymentAccount,
): string | null {
  if (remote.collectorId !== null && remote.collectorId !== account.providerAccountId) {
    return "other_collector";
  }
  if (remote.currency !== null && remote.currency !== "BRL") {
    return "other_currency";
  }
  if (remote.amountCents !== local.amountCents) {
    return "amount_mismatch";
  }
  return null;
}

/**
 * Reads the payment from Mercado Pago with the supplier's token and records its status on the
 * parcel it was made for. The payment must name one of this supplier's parcels (the expected one,
 * when the caller knows it), be paid to the linked account in reais and match the amount;
 * anything else is ignored, never applied.
 */
export async function syncMercadoPagoPayment(input: {
  settings: MercadoPagoSettings;
  account: SupplierPaymentAccount;
  providerPaymentId: string;
  expectedPaymentId?: string;
}): Promise<PaymentSyncResult> {
  const accessToken = await supplierAccessToken(input.settings, input.account);
  const remote = await getMercadoPagoPayment(input.settings, {
    accessToken,
    paymentId: input.providerPaymentId,
  });
  const reference = externalReferenceSchema.safeParse(remote.externalReference);
  if (!reference.success) {
    return { kind: "ignored", reason: "foreign_reference" };
  }
  if (input.expectedPaymentId !== undefined && reference.data !== input.expectedPaymentId) {
    return { kind: "ignored", reason: "other_parcel" };
  }
  const local = await findShipmentPaymentById(database, reference.data);
  if (local === null || local.supplierId !== input.account.supplierId) {
    return { kind: "ignored", reason: "unknown_payment" };
  }
  const mismatch = mismatchReason(remote, local, input.account);
  if (mismatch !== null) {
    logger.warn("mercado_pago.payment_mismatch", { shipmentPaymentId: local.id, reason: mismatch });
    return { kind: "ignored", reason: mismatch };
  }
  const outcome = await applyProviderPayment(database, {
    paymentId: local.id,
    providerPaymentId: remote.id,
    status: shipmentPaymentStatusFrom(remote.status),
    paymentMethod: remote.paymentMethod,
    approvedAt: remote.approvedAt,
  });
  if (outcome === null) {
    return { kind: "ignored", reason: "unknown_payment" };
  }
  if (outcome.kind === "duplicate") {
    // Two approved payments for one parcel: the reseller paid twice and must be refunded by hand.
    logger.error("mercado_pago.duplicate_payment", {
      shipmentPaymentId: local.id,
      providerPaymentId: remote.id,
    });
  }
  logger.info("mercado_pago.payment_synced", {
    shipmentPaymentId: outcome.payment.id,
    status: outcome.payment.status,
    outcome: outcome.kind,
  });
  return { kind: "applied", payment: outcome.payment };
}
