import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashApiKeySecret } from "@/features/public-api/api-key-secret.server";

const TOKEN_BYTES = 32;

/**
 * Long enough to sign up, confirm the e-mail and sign the contract before the link is opened
 * for good; the token itself works only once.
 */
export const ENTRY_LINK_LIFETIME_MINUTES = 60;
const MINUTE_MILLISECONDS = 60_000;

/** 32 random bytes in base64url: 43 characters, nothing else. */
export const entryLinkTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export function generateEntryLinkToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashEntryLinkToken(token) };
}

export function hashEntryLinkToken(token: string): string {
  return hashApiKeySecret(token);
}

export function entryLinkExpiration(now: Date): Date {
  return new Date(now.getTime() + ENTRY_LINK_LIFETIME_MINUTES * MINUTE_MILLISECONDS);
}

/** The page the person opens; the token is the only thing in the URL. */
export function entryLinkUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, "")}/entrar/${token}`;
}
