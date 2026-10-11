import { createHash, randomBytes } from "node:crypto";

/** Recognizable in logs and by secret scanners; the rest is 32 random bytes. */
export const API_KEY_PREFIX = "sb_live_";
const VISIBLE_CHARACTERS = API_KEY_PREFIX.length + 6;
const RANDOM_BYTES = 32;

export interface GeneratedApiKeySecret {
  /** Shown to the person once; never stored. */
  secret: string;
  /** The visible start of the key, stored to tell keys apart. */
  prefix: string;
  secretHash: string;
}

/**
 * SHA-256 is enough here: the secret has 256 random bits, so there is nothing to brute-force
 * and a fast hash lets every request look the key up by its hash.
 */
export function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateApiKeySecret(): GeneratedApiKeySecret {
  const secret = `${API_KEY_PREFIX}${randomBytes(RANDOM_BYTES).toString("base64url")}`;
  return {
    secret,
    prefix: secret.slice(0, VISIBLE_CHARACTERS),
    secretHash: hashApiKeySecret(secret),
  };
}

/** `Authorization: Bearer sb_live_...`; anything else is treated as no key. */
export function readBearerSecret(headers: Headers): string | null {
  const header = headers.get("authorization");
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const secret = match?.[1];
  if (!secret || !secret.startsWith(API_KEY_PREFIX)) {
    return null;
  }
  return secret;
}
