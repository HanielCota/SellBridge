import { AppError, hasErrorCode, isAppError } from "@sellbridge/shared/errors";

/**
 * Failure reported by a marketplace. `retryable` tells the queue whether trying again
 * can succeed (rate limit, timeout, 5xx) or not (invalid data, revoked token).
 */
export function marketplaceError(
  message: string,
  options: { retryable: boolean; status?: number | null; cause?: unknown },
): AppError {
  return new AppError("EXTERNAL_PROVIDER", message, {
    details: { retryable: options.retryable, status: options.status ?? null },
    cause: options.cause,
  });
}

/** The stored token is no longer accepted; the store must be reconnected. */
export function marketplaceAuthError(
  message = "A loja precisa ser reconectada: o acesso foi revogado ou expirou",
): AppError {
  return new AppError("EXTERNAL_PROVIDER_AUTH", message, {
    details: { retryable: false, status: 401 },
  });
}

export function marketplaceNotImplementedError(operation: string, marketplace: string): AppError {
  return marketplaceError(`${operation} ainda não está disponível para ${marketplace}`, {
    retryable: false,
  });
}

export function isMarketplaceError(value: unknown): value is AppError {
  return hasErrorCode(value, "EXTERNAL_PROVIDER") || hasErrorCode(value, "EXTERNAL_PROVIDER_AUTH");
}

export function isMarketplaceAuthError(value: unknown): value is AppError {
  return hasErrorCode(value, "EXTERNAL_PROVIDER_AUTH");
}

/** Unknown failures (bugs, network blips) get the benefit of the doubt and are retried. */
export function isRetryableError(value: unknown): boolean {
  if (!isAppError(value)) {
    return true;
  }
  return value.details.retryable ?? false;
}
