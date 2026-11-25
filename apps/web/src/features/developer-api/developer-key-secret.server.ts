import { randomBytes } from "node:crypto";
import { hashApiKeySecret } from "@/features/public-api/api-key-secret.server";

/**
 * Different from the organizations' `sb_live_` keys, so a developer key is never accepted by
 * `/api/v1` and an organization key never by `/api/dev/v1`.
 */
export const DEVELOPER_KEY_PREFIX = "sb_dev_";
const VISIBLE_CHARACTERS = DEVELOPER_KEY_PREFIX.length + 6;
const RANDOM_BYTES = 32;

export interface GeneratedDeveloperKeySecret {
  /** Shown to the developer once; never stored. */
  secret: string;
  prefix: string;
  secretHash: string;
}

export function generateDeveloperKeySecret(): GeneratedDeveloperKeySecret {
  const secret = `${DEVELOPER_KEY_PREFIX}${randomBytes(RANDOM_BYTES).toString("base64url")}`;
  return {
    secret,
    prefix: secret.slice(0, VISIBLE_CHARACTERS),
    secretHash: hashApiKeySecret(secret),
  };
}

/**
 * Looked up by its SHA-256 through a unique index, never compared as text, so the response time
 * says nothing about how much of a guessed key was right.
 */
export function hashDeveloperKeySecret(secret: string): string {
  return hashApiKeySecret(secret);
}

/** `Authorization: Bearer sb_dev_...`; anything else is treated as no key. */
export function readDeveloperBearerSecret(headers: Headers): string | null {
  const header = headers.get("authorization");
  if (header === null) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const secret = match?.[1];
  if (secret === undefined || !secret.startsWith(DEVELOPER_KEY_PREFIX)) {
    return null;
  }
  return secret;
}
