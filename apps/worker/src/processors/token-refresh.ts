import type { Database } from "@sellbridge/db";
import {
  findConnectionsExpiringBefore,
  markStoreStatus,
  updateStoreTokens,
} from "@sellbridge/db/repositories";
import {
  MarketplaceAuthError,
  type ConnectorRegistry,
  type TokenCipher,
} from "@sellbridge/marketplaces";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";

export interface TokenRefreshDependencies {
  db: Database;
  connectors: ConnectorRegistry;
  cipher: TokenCipher;
  now?: () => Date;
}

/** Refreshes tokens expiring within this window, before they actually expire. */
export const REFRESH_WINDOW_MS = 30 * 60 * 1000;

export interface TokenRefreshSummary {
  refreshed: number;
  expired: number;
  failed: number;
}

type Connection = Awaited<ReturnType<typeof findConnectionsExpiringBefore>>[number];

async function refreshOne(
  deps: TokenRefreshDependencies,
  connection: Connection,
  now: Date,
): Promise<keyof TokenRefreshSummary> {
  if (!connection.refreshTokenEnc) {
    return "failed";
  }
  try {
    const refreshToken = deps.cipher.decrypt(connection.refreshTokenEnc);
    const tokens = await deps.connectors[connection.marketplace].refreshTokens(refreshToken);
    await updateStoreTokens(deps.db, connection.id, {
      accessTokenEnc: deps.cipher.encrypt(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken
        ? deps.cipher.encrypt(tokens.refreshToken)
        : connection.refreshTokenEnc,
      expiresAt: tokens.expiresAt,
    });
    return "refreshed";
  } catch (error) {
    const message = isAppError(error) ? error.userMessage : "Falha ao renovar o acesso da loja";
    const alreadyExpired =
      connection.expiresAt !== null && connection.expiresAt.getTime() <= now.getTime();
    if (error instanceof MarketplaceAuthError || alreadyExpired) {
      await markStoreStatus(deps.db, connection.id, "expired", message);
      logger.warn("store.token_expired", { storeConnectionId: connection.id, error });
      return "expired";
    }
    logger.warn("store.token_refresh_failed", { storeConnectionId: connection.id, error });
    return "failed";
  }
}

export function createTokenRefreshProcessor(deps: TokenRefreshDependencies) {
  return async function processTokenRefresh(): Promise<TokenRefreshSummary> {
    const now = deps.now?.() ?? new Date();
    const expiring = await findConnectionsExpiringBefore(
      deps.db,
      new Date(now.getTime() + REFRESH_WINDOW_MS),
    );
    const summary: TokenRefreshSummary = { refreshed: 0, expired: 0, failed: 0 };
    for (const connection of expiring) {
      const outcome = await refreshOne(deps, connection, now);
      summary[outcome] += 1;
    }
    if (expiring.length > 0) {
      logger.info("store.token_refresh_run", { ...summary });
    }
    return summary;
  };
}
