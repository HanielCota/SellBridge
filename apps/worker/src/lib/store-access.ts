import type { Database } from "@sellbridge/database";
import { markStoreStatus } from "@sellbridge/database/repositories";
import { isMarketplaceAuthError, type StoreCredentials } from "@sellbridge/marketplaces";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";

/** Store connection fields needed to talk to the marketplace on its behalf. */
interface StoreTokenSource {
  readonly externalShopId: string;
  readonly accessTokenEnc: string | null;
}

/** Decrypts the access token of a store known to have one. */
export function decryptStoreCredentials(
  cipher: TokenCipher,
  store: { readonly externalShopId: string; readonly accessTokenEnc: string },
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
  return decryptStoreCredentials(cipher, {
    externalShopId: store.externalShopId,
    accessTokenEnc: store.accessTokenEnc,
  });
}

/** Marks the store as expired: the seller has to reconnect it. */
export async function expireStore(
  database: Database,
  storeId: string,
  message: string,
): Promise<void> {
  await markStoreStatus(database, storeId, "expired", message);
}

/** Expires the store when the marketplace rejected its credentials; returns whether it did. */
export async function expireStoreOnAuthError(
  database: Database,
  storeId: string,
  error: unknown,
): Promise<boolean> {
  if (!isMarketplaceAuthError(error)) {
    return false;
  }
  await expireStore(database, storeId, error.userMessage);
  return true;
}
