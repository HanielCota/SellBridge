import {
  markSupplierPaymentAccountError,
  rotatePaymentAccountTokens,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { isMercadoPagoError, refreshMercadoPagoTokens } from "./client.ts";
import type { MercadoPagoContext } from "./context.ts";

/** Tokens last 180 days; they are renewed when a week or less is left. */
const REFRESH_BEFORE_EXPIRY_IN_MS = 7 * 24 * 60 * 60 * 1000;
export const UNAUTHORIZED = 401;

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
  context: MercadoPagoContext,
  account: SupplierPaymentAccount,
): Promise<string> {
  if (account.status !== "connected" || account.accessTokenEnc === null) {
    throw new PaymentAccountUnavailableError(`Payment account ${account.id} is not linked`);
  }
  const expiresAt = account.expiresAt?.getTime() ?? 0;
  if (expiresAt - Date.now() > REFRESH_BEFORE_EXPIRY_IN_MS || account.refreshTokenEnc === null) {
    return context.cipher.decrypt(account.accessTokenEnc);
  }
  try {
    const tokens = await refreshMercadoPagoTokens(
      context.settings,
      context.cipher.decrypt(account.refreshTokenEnc),
    );
    await rotatePaymentAccountTokens(context.database, {
      accountId: account.id,
      previousRefreshTokenEnc: account.refreshTokenEnc,
      tokens: {
        accessTokenEnc: context.cipher.encrypt(tokens.accessToken),
        refreshTokenEnc: context.cipher.encrypt(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
      },
    });
    logger.info("mercado_pago.tokens_refreshed", { supplierId: account.supplierId });
    return tokens.accessToken;
  } catch (error) {
    if (isMercadoPagoError(error) && error.refusedCredentials) {
      await markSupplierPaymentAccountError(context.database, {
        accountId: account.id,
        lastError: "refresh_refused",
        refreshTokenEnc: account.refreshTokenEnc,
      });
      throw new PaymentAccountUnavailableError(`Mercado Pago refused account ${account.id}`);
    }
    throw error;
  }
}

/**
 * Runs a call made with the supplier's token. A 401 means the supplier revoked SellBridge in
 * Mercado Pago: the account is marked in error, so it shows "Ligar de novo" instead of failing
 * every checkout and notice.
 *
 * @throws {PaymentAccountUnavailableError} When Mercado Pago refuses the token.
 */
export async function withSupplierAccount<Result>(
  context: MercadoPagoContext,
  account: SupplierPaymentAccount,
  call: () => Promise<Result>,
): Promise<Result> {
  try {
    return await call();
  } catch (error) {
    if (isMercadoPagoError(error) && error.status === UNAUTHORIZED) {
      await markSupplierPaymentAccountError(context.database, {
        accountId: account.id,
        lastError: "token_refused",
        refreshTokenEnc: account.refreshTokenEnc,
      });
      throw new PaymentAccountUnavailableError(
        `Mercado Pago refused the token of account ${account.id}`,
      );
    }
    throw error;
  }
}
