import {
  findErpConnection,
  findResellerErpConnection,
  markErpPermissionMissing,
  recordErpRefreshFailure,
  recordResellerErpRefreshFailure,
  rotateErpTokens,
  rotateResellerErpTokens,
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
import { sharedRateSlots } from "@/lib/server/queues";
import { blingCredentialsFrom } from "./bling-connection";

/** The account's 3 requests per second are shared with the worker through Redis. */
const limiter = createBlingRateLimiter({ sharedSlots: sharedRateSlots("bling") });

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
        markPermissionMissing: async (connectionId, accessTokenEnc) => {
          await markErpPermissionMissing(database, {
            connectionId,
            accessTokenEnc,
            now: new Date(),
          });
        },
      },
    }),
  });
}

/** A Bling client acting on the reseller's own connected account (its sale notes). */
export function resellerBlingClient(
  tenantId: string,
  credentials: BlingAppCredentials,
): BlingClient {
  return createBlingClient({
    http: { fetchImplementation: fetch },
    limiter,
    access: storedBlingAccess({
      accountKey: `reseller:${tenantId}`,
      credentials,
      cipher: tokenCipher,
      fetchImplementation: fetch,
      store: {
        load: async () => findResellerErpConnection(database, { tenantId, provider: "bling" }),
        rotate: async (connectionId, previousRefreshTokenEnc, tokens) =>
          rotateResellerErpTokens(database, { connectionId, previousRefreshTokenEnc, tokens }),
        markExpired: async (connectionId, refreshTokenEnc, lastError) => {
          await recordResellerErpRefreshFailure(database, {
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
