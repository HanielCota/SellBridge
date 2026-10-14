import type { Database } from "@sellbridge/database";
import {
  findConnectionsExpiringBefore,
  markStoreStatus,
  recordStoreError,
  updateStoreTokens,
} from "@sellbridge/database/repositories";
import { type ConnectorRegistry, isMarketplaceAuthError } from "@sellbridge/marketplaces";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";

export interface TokenRefreshDependencies {
  database: Database;
  connectors: ConnectorRegistry;
  cipher: TokenCipher;
}

/** Refreshes tokens expiring within this window, before they actually expire. */
const REFRESH_WINDOW_MILLISECONDS = 30 * 60 * 1000;

export interface TokenRefreshSummary {
  refreshed: number;
  expired: number;
  failed: number;
  /** The store was disconnected, reconnected or refreshed by another run meanwhile. */
  superseded: number;
}

const TRANSIENT_FAILURE_MESSAGE = "Falha ao renovar o acesso da loja; tentaremos de novo";

type Connection = Awaited<ReturnType<typeof findConnectionsExpiringBefore>>[number];

interface RefreshAttempt {
  readonly dependencies: TokenRefreshDependencies;
  readonly connection: Connection;
  readonly refreshTokenEnc: string;
}

async function rotateTokens(attempt: RefreshAttempt): Promise<keyof TokenRefreshSummary> {
  const { dependencies, connection } = attempt;
  const refreshToken = dependencies.cipher.decrypt(attempt.refreshTokenEnc);
  const tokens = await dependencies.connectors[connection.marketplace].refreshTokens(refreshToken);
  const swapped = await updateStoreTokens(dependencies.database, {
    storeConnectionId: connection.id,
    previousRefreshTokenEnc: attempt.refreshTokenEnc,
    tokens: {
      accessTokenEnc: dependencies.cipher.encrypt(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken
        ? dependencies.cipher.encrypt(tokens.refreshToken)
        : attempt.refreshTokenEnc,
      expiresAt: tokens.expiresAt,
    },
  });
  if (!swapped) {
    logger.info("store.token_refresh_superseded", { storeConnectionId: connection.id });
    return "superseded";
  }
  return "refreshed";
}

/**
 * Only a marketplace auth error (revoked or invalid refresh token) expires the store. A timeout
 * or 5xx keeps it connected with the error shown, and the next run tries again: expiring it
 * would make every seller reconnect after a short marketplace outage.
 */
async function handleRefreshFailure(
  attempt: RefreshAttempt,
  error: unknown,
): Promise<keyof TokenRefreshSummary> {
  const { dependencies, connection } = attempt;
  if (isMarketplaceAuthError(error)) {
    const expired = await markStoreStatus(dependencies.database, {
      storeConnectionId: connection.id,
      status: "expired",
      lastError: error.userMessage,
      refreshTokenEnc: attempt.refreshTokenEnc,
    });
    logger.warn("store.token_expired", { storeConnectionId: connection.id, expired, error });
    return expired ? "expired" : "superseded";
  }
  const message = userMessageOr(error, TRANSIENT_FAILURE_MESSAGE);
  await recordStoreError(dependencies.database, connection.id, message);
  logger.warn("store.token_refresh_failed", { storeConnectionId: connection.id, error });
  return "failed";
}

async function refreshOne(
  dependencies: TokenRefreshDependencies,
  connection: Connection,
): Promise<keyof TokenRefreshSummary> {
  if (!connection.refreshTokenEnc) {
    return "failed";
  }
  const attempt = { dependencies, connection, refreshTokenEnc: connection.refreshTokenEnc };
  try {
    return await rotateTokens(attempt);
  } catch (error) {
    return handleRefreshFailure(attempt, error);
  }
}

export function createTokenRefreshProcessor(dependencies: TokenRefreshDependencies) {
  return async function processTokenRefresh(): Promise<TokenRefreshSummary> {
    const expiring = await findConnectionsExpiringBefore(
      dependencies.database,
      new Date(Date.now() + REFRESH_WINDOW_MILLISECONDS),
    );
    const summary: TokenRefreshSummary = { refreshed: 0, expired: 0, failed: 0, superseded: 0 };
    for (const connection of expiring) {
      const outcome = await refreshOne(dependencies, connection);
      summary[outcome] += 1;
    }
    if (expiring.length > 0) {
      logger.info("store.token_refresh_run", { ...summary });
    }
    return summary;
  };
}
