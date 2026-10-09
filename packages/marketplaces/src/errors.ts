import { AppError } from "@sellbridge/shared/errors";

/**
 * Failure reported by a marketplace. `retryable` tells the queue whether trying
 * again can succeed (rate limit, timeout, 5xx) or not (invalid data, revoked token).
 */
export class MarketplaceError extends AppError {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(
    message: string,
    options: { retryable: boolean; status?: number | null; cause?: unknown },
  ) {
    super("EXTERNAL_PROVIDER", message, { cause: options.cause });
    this.retryable = options.retryable;
    this.status = options.status ?? null;
  }
}

/** The stored token is no longer accepted; the store must be reconnected. */
export class MarketplaceAuthError extends MarketplaceError {
  constructor(message = "A loja precisa ser reconectada: o acesso foi revogado ou expirou") {
    super(message, { retryable: false, status: 401 });
  }
}

export class MarketplaceNotImplementedError extends MarketplaceError {
  constructor(operation: string, marketplace: string) {
    super(`${operation} ainda não está disponível para ${marketplace}`, { retryable: false });
  }
}

export function isMarketplaceError(value: unknown): value is MarketplaceError {
  return value instanceof MarketplaceError;
}
