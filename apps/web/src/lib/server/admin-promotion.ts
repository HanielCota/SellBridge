/** What the admin rules read from the account that just signed in. */
export interface AdminAccessAccount {
  readonly email: string;
  readonly emailVerified: boolean;
}

/** The account the promotion acts on, with the address the reset link goes to. */
export interface PromotedAccount {
  readonly userId: string;
  readonly email: string;
}

export interface AdminAccessSteps {
  readonly findAccount: (userId: string) => Promise<AdminAccessAccount | null>;
  readonly isAdminAddress: (email: string) => boolean;
  readonly sendVerificationEmail: (email: string) => Promise<void>;
  readonly promote: (account: PromotedAccount) => Promise<void>;
}

/**
 * Settles the admin role of an `ADMIN_EMAILS` address on every sign-in: an unproven mailbox gets
 * the verification link, a proven one is promoted. Promoting here is what reaches an account that
 * was already verified before its address joined the list, which no other hook covers (the
 * creation hook ran before the list changed, and nothing updates the user row on its own).
 */
export async function settleAdminAccess(userId: string, steps: AdminAccessSteps): Promise<void> {
  const account = await steps.findAccount(userId);
  if (account === null) {
    return;
  }
  if (!steps.isAdminAddress(account.email)) {
    return;
  }
  if (!account.emailVerified) {
    await steps.sendVerificationEmail(account.email);
    return;
  }
  await steps.promote({ userId, email: account.email });
}
