import { marketplaceAuthError, marketplaceError } from "../errors.ts";
import type { PublishProductInput, StockPriceUpdate, StoreCredentials } from "../types.ts";

/**
 * Deterministic rules of the simulated marketplace, so tests can trigger each path:
 * - title containing "[falha]"    → permanent rejection (not retried)
 * - title containing "[instavel]" → temporary failure (retried until attempts run out)
 * - price below R$ 5,00           → permanent rejection
 * - refresh token "mock-refresh-revoked" → store must be reconnected
 */
const MIN_PRICE_CENTS = 500;
export const MOCK_REVOKED_REFRESH_TOKEN = "mock-refresh-revoked";

export function assertCredentials(credentials: StoreCredentials): void {
  if (!credentials.accessToken.startsWith("mock-access-")) {
    throw marketplaceAuthError();
  }
}

export function assertRefreshable(refreshToken: string): void {
  if (refreshToken === MOCK_REVOKED_REFRESH_TOKEN || !refreshToken.startsWith("mock-refresh-")) {
    throw marketplaceAuthError();
  }
}

export function assertPublishable(input: PublishProductInput): void {
  const title = input.title.toLowerCase();
  if (title.includes("[falha]")) {
    throw marketplaceError("Anúncio recusado: o título contém termos não permitidos", {
      retryable: false,
      status: 422,
    });
  }
  if (title.includes("[instavel]")) {
    throw marketplaceError("Marketplace indisponível no momento", {
      retryable: true,
      status: 503,
    });
  }
  if (input.priceCents < MIN_PRICE_CENTS) {
    throw marketplaceError("Anúncio recusado: o preço mínimo é R$ 5,00", {
      retryable: false,
      status: 422,
    });
  }
}

export function assertPriceAccepted(update: StockPriceUpdate): void {
  if (update.priceCents !== undefined && update.priceCents < MIN_PRICE_CENTS) {
    throw marketplaceError("Preço abaixo do mínimo do marketplace", {
      retryable: false,
      status: 422,
    });
  }
}
