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

const SEND_COOLDOWN_IN_MS = 60_000;
const MAX_TRACKED_ADDRESSES = 1_000;

/**
 * Lets one confirmation link per address go out per minute. Kept in memory and capped: a restart
 * only allows one extra e-mail, and the oldest addresses are dropped when the cap is reached.
 */
export function createSendCooldown() {
  const lastSentAt = new Map<string, number>();
  return {
    tryStart(email: string, nowInMs: number): boolean {
      const key = email.trim().toLowerCase();
      const previous = lastSentAt.get(key);
      if (previous !== undefined && nowInMs - previous < SEND_COOLDOWN_IN_MS) {
        return false;
      }
      lastSentAt.delete(key);
      if (lastSentAt.size >= MAX_TRACKED_ADDRESSES) {
        const oldest = lastSentAt.keys().next();
        if (oldest.done !== true) {
          lastSentAt.delete(oldest.value);
        }
      }
      lastSentAt.set(key, nowInMs);
      return true;
    },
  };
}
