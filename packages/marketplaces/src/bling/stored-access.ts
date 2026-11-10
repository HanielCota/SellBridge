import { conflictError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { isMarketplaceAuthError } from "../errors.ts";
import type { FetchLike } from "../http.ts";
import type { BlingAccountAccess } from "./client.ts";
import { refreshBlingTokens, type BlingAppCredentials, type BlingTokens } from "./oauth.ts";

export const BLING_RECONNECT_MESSAGE = "Conecte o Bling de novo para continuar.";

/** The saved connection as the access needs it (encrypted tokens). */
export interface StoredBlingConnection {
  readonly id: string;
  readonly status: string;
  readonly accessTokenEnc: string | null;
  readonly refreshTokenEnc: string | null;
  readonly expiresAt: Date | null;
}

export interface EncryptedTokens {
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiresAt: Date;
}

/** Where the tokens live; the web app and the worker pass their own database calls. */
export interface BlingConnectionStore {
  readonly load: () => Promise<StoredBlingConnection | null>;
  /** Saves only while `previousRefreshTokenEnc` is still the saved one. */
  readonly rotate: (
    connectionId: string,
    previousRefreshTokenEnc: string,
    tokens: EncryptedTokens,
  ) => Promise<boolean>;
  readonly markExpired: (
    connectionId: string,
    refreshTokenEnc: string,
    lastError: string,
  ) => Promise<void>;
}

interface UsableConnection {
  readonly id: string;
  readonly accessTokenEnc: string;
  readonly refreshTokenEnc: string;
  readonly expiresAt: Date;
}

async function usableConnection(store: BlingConnectionStore): Promise<UsableConnection> {
  const connection = await store.load();
  if (
    connection?.status !== "connected" ||
    connection.accessTokenEnc === null ||
    connection.refreshTokenEnc === null
  ) {
    throw conflictError(BLING_RECONNECT_MESSAGE);
  }
  return {
    id: connection.id,
    accessTokenEnc: connection.accessTokenEnc,
    refreshTokenEnc: connection.refreshTokenEnc,
    expiresAt: connection.expiresAt ?? new Date(0),
  };
}

function decrypt(cipher: TokenCipher, connection: UsableConnection): BlingTokens {
  return {
    accessToken: cipher.decrypt(connection.accessTokenEnc),
    refreshToken: cipher.decrypt(connection.refreshTokenEnc),
    expiresAt: connection.expiresAt,
  };
}

/**
 * The tokens another refresh saved after `used` was read (the web app and the worker refresh the
 * same account), or null when the saved refresh token is still the one that was refused.
 */
async function tokensRenewedSince(
  store: BlingConnectionStore,
  cipher: TokenCipher,
  used: UsableConnection,
): Promise<BlingTokens | null> {
  const latest = await usableConnection(store);
  if (latest.refreshTokenEnc === used.refreshTokenEnc) {
    return null;
  }
  return decrypt(cipher, latest);
}

function encrypt(cipher: TokenCipher, tokens: BlingTokens): EncryptedTokens {
  return {
    accessTokenEnc: cipher.encrypt(tokens.accessToken),
    refreshTokenEnc: cipher.encrypt(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
  };
}

/**
 * Tokens of a supplier's saved Bling connection: decrypted on read, refreshed and saved on demand.
 * A refused refresh token marks the connection expired; the supplier connects again.
 */
export function storedBlingAccess(input: {
  accountKey: string;
  credentials: BlingAppCredentials;
  cipher: TokenCipher;
  store: BlingConnectionStore;
  fetchImplementation: FetchLike;
}): BlingAccountAccess {
  const { cipher, store } = input;
  return {
    accountKey: input.accountKey,
    async currentTokens() {
      return decrypt(cipher, await usableConnection(store));
    },
    async refresh() {
      const connection = await usableConnection(store);
      try {
        const tokens = await refreshBlingTokens(
          { fetchImplementation: input.fetchImplementation, credentials: input.credentials },
          cipher.decrypt(connection.refreshTokenEnc),
        );
        await store.rotate(connection.id, connection.refreshTokenEnc, encrypt(cipher, tokens));
        return tokens;
      } catch (error) {
        if (!isMarketplaceAuthError(error)) {
          throw error;
        }
        const renewed = await tokensRenewedSince(store, cipher, connection);
        if (renewed !== null) {
          return renewed;
        }
        await store.markExpired(connection.id, connection.refreshTokenEnc, BLING_RECONNECT_MESSAGE);
        logger.warn("bling.connection_expired", { accountKey: input.accountKey });
        throw conflictError(BLING_RECONNECT_MESSAGE);
      }
    },
  };
}
