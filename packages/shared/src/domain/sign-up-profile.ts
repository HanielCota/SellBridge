import { z } from "zod";

/** The profile a new account starts with: a reseller's store or a supplier's catalog. */
export const SIGN_UP_PROFILE_KINDS = ["seller", "supplier"] as const;
export type SignUpProfileKind = (typeof SIGN_UP_PROFILE_KINDS)[number];

/**
 * Carries the sign-up choice to the hook that creates the account's first profile. The sign-up
 * page sets it right before creating the account, by e-mail or through the Google redirect (where
 * the account is created on the OAuth callback, with no form body to read).
 */
export const SIGN_UP_PROFILE_COOKIE = "sellbridge_signup_profile";
export const SIGN_UP_PROFILE_COOKIE_SECONDS = 10 * 60;

const RECEIVED_PREVIEW_LENGTH = 40;

export const signUpProfileKindSchema = z.enum(SIGN_UP_PROFILE_KINDS, {
  error: (issue) =>
    `Tipo de conta inválido: recebido "${String(issue.input).slice(0, RECEIVED_PREVIEW_LENGTH)}", esperado "seller" ou "supplier".`,
});

/** The remembered choice when it is a profile kind; otherwise a seller, as every account was before. */
export function resolveSignUpProfileKind(remembered: string | undefined): SignUpProfileKind {
  const parsed = signUpProfileKindSchema.safeParse(remembered);
  if (!parsed.success) {
    return "seller";
  }
  return parsed.data;
}
