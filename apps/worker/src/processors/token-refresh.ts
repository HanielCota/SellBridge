import type { Database } from "@sellbridge/database";
import {
  findConnectionsExpiringBefore,
  markStoreStatus,
  recordStoreError,
  updateStoreTokens,
} from "@sellbridge/database/repositories";
import {
  type ConnectorRegistry,
  isMarketplaceAuthError,
  type OAuthTokens,
} from "@sellbridge/marketplaces";
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

/**
 * Marketplaces such as Shopee invalidate the old refresh token as soon as they issue a new one:
 * a pair that is not saved is lost for good, so the save is tried again before giving up.
 */
const SAVE_ATTEMPTS = 3;
const SAVE_RETRY_DELAY_IN_MS = 250;

const TRANSIENT_FAILURE_MESSAGE =
  "Não deu para renovar a conexão da loja agora. O SellBridge tenta de novo sozinho.";

type Connection = Awaited<ReturnType<typeof findConnectionsExpiringBefore>>[number];

interface RefreshAttempt {
  readonly dependencies: TokenRefreshDependencies;
  readonly connection: Connection;
  readonly refreshTokenEnc: string;
}

async function saveTokens(attempt: RefreshAttempt, tokens: OAuthTokens): Promise<boolean> {
  const { dependencies, connection } = attempt;
  return updateStoreTokens(dependencies.database, {
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
}

function reportLostTokens(connection: Connection, error: unknown) {
  logger.error("store.token_save_failed", {
    reason: `A renovação da conexão da loja deu certo no canal, mas a chave nova não foi salva depois de ${SAVE_ATTEMPTS} tentativas. Se o canal já invalidou a chave antiga, a loja vai pedir para reconectar.`,
    storeConnectionId: connection.id,
    marketplace: connection.marketplace,
    problemKey: `token-save-failed:${connection.id}`,
    // The name only: a failed query error carries its parameters, the encrypted tokens included.
    errorName: error instanceof Error ? error.name : typeof error,
  });
}

/** Saves the new pair, trying again: the marketplace may already refuse the old refresh token. */
async function saveWithRetry(attempt: RefreshAttempt, tokens: OAuthTokens) {
  let lastError: unknown;
  for (let tried = 1; tried <= SAVE_ATTEMPTS; tried += 1) {
    try {
      return { saved: true as const, swapped: await saveTokens(attempt, tokens) };
    } catch (error) {
      lastError = error;
      logger.warn("store.token_save_retry", { storeConnectionId: attempt.connection.id, tried });
      if (tried < SAVE_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, SAVE_RETRY_DELAY_IN_MS));
      }
    }
  }
  return { saved: false as const, error: lastError };
}

async function rotateTokens(attempt: RefreshAttempt): Promise<keyof TokenRefreshSummary> {
  const { dependencies, connection } = attempt;
  const refreshToken = dependencies.cipher.decrypt(attempt.refreshTokenEnc);
  const tokens = await dependencies.connectors[connection.marketplace].refreshTokens(refreshToken, {
    externalShopId: connection.externalShopId,
  });
  const result = await saveWithRetry(attempt, tokens);
  if (!result.saved) {
    reportLostTokens(connection, result.error);
    return "failed";
  }
  if (!result.swapped) {
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
  await recordStoreError(dependencies.database, {
    storeConnectionId: connection.id,
    lastError: message,
    refreshTokenEnc: attempt.refreshTokenEnc,
  });
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
