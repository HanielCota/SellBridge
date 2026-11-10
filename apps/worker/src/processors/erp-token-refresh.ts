import type { Database } from "@sellbridge/database";
import {
  findErpConnectionsExpiringBefore,
  recordErpRefreshFailure,
  rotateErpTokens,
  type ErpConnection,
} from "@sellbridge/database/repositories";
import { isMarketplaceAuthError, type FetchLike } from "@sellbridge/marketplaces";
import {
  BLING_RECONNECT_MESSAGE,
  refreshBlingTokens,
  type BlingAppCredentials,
} from "@sellbridge/marketplaces/bling";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";

export interface ErpTokenRefreshDependencies {
  readonly database: Database;
  readonly cipher: TokenCipher;
  /** Null while the Bling app keys are not configured: nothing is refreshed. */
  readonly blingCredentials: BlingAppCredentials | null;
  readonly fetchImplementation: FetchLike;
}

export interface ErpTokenRefreshSummary {
  refreshed: number;
  expired: number;
  failed: number;
  superseded: number;
}

/** Bling access tokens last 6 hours; the job runs every 10 minutes and renews the last 30. */
const REFRESH_WINDOW_IN_MS = 30 * 60 * 1000;

const PASSING_FAILURE_MESSAGE = "Falha ao renovar o acesso ao Bling; tentaremos de novo";

async function refreshOne(
  dependencies: ErpTokenRefreshDependencies & { blingCredentials: BlingAppCredentials },
  connection: ErpConnection,
): Promise<keyof ErpTokenRefreshSummary> {
  const refreshTokenEnc = connection.refreshTokenEnc;
  if (refreshTokenEnc === null) {
    return "failed";
  }
  try {
    const tokens = await refreshBlingTokens(
      {
        fetchImplementation: dependencies.fetchImplementation,
        credentials: dependencies.blingCredentials,
      },
      dependencies.cipher.decrypt(refreshTokenEnc),
    );
    const swapped = await rotateErpTokens(dependencies.database, {
      connectionId: connection.id,
      previousRefreshTokenEnc: refreshTokenEnc,
      tokens: {
        accessTokenEnc: dependencies.cipher.encrypt(tokens.accessToken),
        refreshTokenEnc: dependencies.cipher.encrypt(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
      },
    });
    return swapped ? "refreshed" : "superseded";
  } catch (error) {
    // Only a refused refresh token expires the connection; an outage keeps it and tries again.
    const expired = isMarketplaceAuthError(error);
    const recorded = await recordErpRefreshFailure(dependencies.database, {
      connectionId: connection.id,
      refreshTokenEnc,
      lastError: expired ? BLING_RECONNECT_MESSAGE : userMessageOr(error, PASSING_FAILURE_MESSAGE),
      expired,
    });
    logger.warn("erp.token_refresh_failed", {
      connectionId: connection.id,
      supplierId: connection.supplierId,
      expired,
      error,
    });
    if (!recorded) {
      return "superseded";
    }
    return expired ? "expired" : "failed";
  }
}

/** Renews the ERP accounts' tokens before they expire, one by one (Bling: 20 token calls/min). */
export function createErpTokenRefreshProcessor(dependencies: ErpTokenRefreshDependencies) {
  return async function processErpTokenRefresh(): Promise<ErpTokenRefreshSummary> {
    const summary: ErpTokenRefreshSummary = { refreshed: 0, expired: 0, failed: 0, superseded: 0 };
    const credentials = dependencies.blingCredentials;
    if (credentials === null) {
      return summary;
    }
    const expiring = await findErpConnectionsExpiringBefore(
      dependencies.database,
      new Date(Date.now() + REFRESH_WINDOW_IN_MS),
    );
    for (const connection of expiring) {
      const outcome = await refreshOne(
        { ...dependencies, blingCredentials: credentials },
        connection,
      );
      summary[outcome] += 1;
    }
    if (expiring.length > 0) {
      logger.info("erp.token_refresh_run", { ...summary });
    }
    return summary;
  };
}
