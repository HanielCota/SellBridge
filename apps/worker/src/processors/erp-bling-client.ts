import type { Database } from "@sellbridge/database";
import {
  findErpConnection,
  recordErpRefreshFailure,
  rotateErpTokens,
} from "@sellbridge/database/repositories";
import type { FetchLike } from "@sellbridge/marketplaces";
import {
  createBlingClient,
  storedBlingAccess,
  type BlingAppCredentials,
  type BlingClient,
  type BlingRateLimiter,
} from "@sellbridge/marketplaces/bling";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";

/** What the worker's Bling jobs need; the credentials are null while the app keys are unset. */
export interface ErpBlingDependencies {
  readonly database: Database;
  readonly cipher: TokenCipher;
  readonly blingCredentials: BlingAppCredentials | null;
  readonly limiter: BlingRateLimiter;
  readonly fetchImplementation: FetchLike;
}

/** A Bling client on the supplier's saved connection, renewing and saving its tokens. */
export function supplierBlingClient(
  dependencies: ErpBlingDependencies & { blingCredentials: BlingAppCredentials },
  supplierId: string,
): BlingClient {
  const { database } = dependencies;
  return createBlingClient({
    http: { fetchImplementation: dependencies.fetchImplementation },
    limiter: dependencies.limiter,
    access: storedBlingAccess({
      accountKey: supplierId,
      credentials: dependencies.blingCredentials,
      cipher: dependencies.cipher,
      fetchImplementation: dependencies.fetchImplementation,
      store: {
        load: async () => findErpConnection(database, { supplierId, provider: "bling" }),
        rotate: async (connectionId, previousRefreshTokenEnc, tokens) =>
          rotateErpTokens(database, { connectionId, previousRefreshTokenEnc, tokens }),
        markExpired: async (connectionId, refreshTokenEnc, lastError) => {
          await recordErpRefreshFailure(database, {
            connectionId,
            refreshTokenEnc,
            lastError,
            expired: true,
          });
        },
      },
    }),
  });
}
