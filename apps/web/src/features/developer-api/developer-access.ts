/** The account fields that decide developer access. */
export interface DeveloperCandidate {
  email: string;
  emailVerified: boolean;
  banned: boolean;
}

/**
 * Whether the account may use the developer API: its confirmed e-mail is in `DEVELOPER_EMAILS`
 * and it is not blocked. The app role plays no part, so admins are not developers by default.
 */
export function isDeveloperAccount(
  account: DeveloperCandidate,
  developerEmails: readonly string[],
): boolean {
  if (!account.emailVerified || account.banned) {
    return false;
  }
  return developerEmails.includes(account.email.trim().toLowerCase());
}

/**
 * The signed-in session, and also not a staff member using "Entrar como cliente": the
 * impersonating admin would otherwise borrow the developer's access.
 */
export function isDeveloperSession(
  session: { account: DeveloperCandidate; impersonatedBy: string | null },
  developerEmails: readonly string[],
): boolean {
  if (session.impersonatedBy !== null) {
    return false;
  }
  return isDeveloperAccount(session.account, developerEmails);
}
