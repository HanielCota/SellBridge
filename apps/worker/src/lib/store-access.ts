import type { Database } from "@sellbridge/database";
import { markStoreStatus } from "@sellbridge/database/repositories";
import { isMarketplaceAuthError, type StoreCredentials } from "@sellbridge/marketplaces";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";

/** Store connection fields needed to talk to the marketplace on its behalf. */
interface StoreTokenSource {
  readonly externalShopId: string;
  readonly accessTokenEnc: string | null;
}

/** Throws when the stored token cannot be decrypted (wrong key or corrupted value). */
export function decryptStoreCredentials(
  cipher: TokenCipher,
  store: StoreTokenSource & { readonly accessTokenEnc: string },
): StoreCredentials {
  return {
    externalShopId: store.externalShopId,
    accessToken: cipher.decrypt(store.accessTokenEnc),
  };
}

/** Credentials for a store connection, or null when it has no access token. */
export function resolveStoreCredentials(
  cipher: TokenCipher,
  store: StoreTokenSource,
): StoreCredentials | null {
  if (!store.accessTokenEnc) {
    return null;
  }
  return decryptStoreCredentials(cipher, { ...store, accessTokenEnc: store.accessTokenEnc });
}

/** Rate limits are per store: each connection has its own marketplace quota. */
export function storeRateKey(store: { readonly marketplace: string; readonly id: string }): string {
  return `${store.marketplace}:${store.id}`;
}

/**
 * Expires the store when the marketplace rejected its credentials (the seller has to
 * reconnect it); returns whether it did.
 */
export async function expireStoreOnAuthError(
  database: Database,
  storeId: string,
  error: unknown,
): Promise<boolean> {
  if (!isMarketplaceAuthError(error)) {
    return false;
  }
  await markStoreStatus(database, {
    storeConnectionId: storeId,
    status: "expired",
    lastError: error.userMessage,
  });
  return true;
}
