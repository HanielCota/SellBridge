import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashApiKeySecret } from "@/features/public-api/api-key-secret.server";

const TOKEN_BYTES = 32;

/**
 * The other project hands the link over right away: five minutes is enough to click it and
 * keeps a link that leaks into a log or a chat useless soon after. It works once.
 */
export const ENTRY_LINK_LIFETIME_MINUTES = 5;
/**
 * After the click the choice waits in the browser, long enough to sign up, confirm the e-mail
 * and sign the contract.
 */
export const ENTRY_CHOICE_LIFETIME_MINUTES = 120;
/** httpOnly: page scripts never see the secret that holds the choice. */
export const ENTRY_CHOICE_COOKIE = "sb_entry_choice";
const MINUTE_MILLISECONDS = 60_000;

/** 32 random bytes in base64url: 43 characters, nothing else. */
export const entryLinkTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export function generateEntryLinkToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashEntryLinkToken(token) };
}

/** Same shape as the token; it lives only in the httpOnly cookie, never in a URL. */
export function generateEntryChoiceSecret(): { secret: string; secretHash: string } {
  const secret = randomBytes(TOKEN_BYTES).toString("base64url");
  return { secret, secretHash: hashEntryLinkToken(secret) };
}

/** Choices clicked before this moment are too old to claim. */
export function entryChoiceFreshSince(now: Date): Date {
  return new Date(now.getTime() - ENTRY_CHOICE_LIFETIME_MINUTES * MINUTE_MILLISECONDS);
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
