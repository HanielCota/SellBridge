import {
  findErpConnection,
  recordErpRefreshFailure,
  rotateErpTokens,
} from "@sellbridge/database/repositories";
import {
  createBlingClient,
  createBlingRateLimiter,
  storedBlingAccess,
  type BlingAppCredentials,
  type BlingClient,
} from "@sellbridge/marketplaces/bling";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { tokenCipher } from "@/lib/server/marketplaces";
import { blingCredentialsFrom } from "./bling-connection";

/** One limiter for the whole web process: every request of an account shares its 3 per second. */
const limiter = createBlingRateLimiter();

export function blingCredentials(): BlingAppCredentials | null {
  return blingCredentialsFrom(environment);
}

/** A Bling client acting on the supplier's connected account. */
export function supplierBlingClient(
  supplierId: string,
  credentials: BlingAppCredentials,
): BlingClient {
  return createBlingClient({
    http: { fetchImplementation: fetch },
    limiter,
    access: storedBlingAccess({
      accountKey: supplierId,
      credentials,
      cipher: tokenCipher,
      fetchImplementation: fetch,
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
