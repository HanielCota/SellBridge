/** What the sign-in guard reads from the account behind a new session. */
export interface EmailConfirmationState {
  readonly emailVerified: boolean;
  readonly emailConfirmationRequired: boolean;
}

/**
 * An e-mail and password sign-up gets no session before its link is opened, so whoever typed
 * someone else's address never enters that account. An admin's visit ("Entrar como cliente") is
 * not the customer signing in and passes; accounts from before the rule keep signing in.
 */
export function mustConfirmBeforeSession(
  account: EmailConfirmationState,
  isAdminVisit: boolean,
): boolean {
  if (isAdminVisit) {
    return false;
  }
  return account.emailConfirmationRequired && !account.emailVerified;
}
