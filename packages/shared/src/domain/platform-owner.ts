import { staffRoleOf } from "./staff-access.ts";

/** What the owner rules read from an account (Better Auth's `user` row). */
export interface AccountIdentity {
  email: string;
  emailVerified: boolean;
  role: string | null | undefined;
}

function isOwnerEmail(email: string, ownerEmails: readonly string[]): boolean {
  return ownerEmails.includes(email.toLowerCase());
}

/** Better Auth stores several roles as "user,admin" and grants the powers of any of them. */
function rolesOf(role: string | null | undefined): string[] {
  if (role === null || role === undefined) {
    return [];
  }
  return role.split(",").map((part) => part.trim());
}

/**
 * The platform owners are the ADMIN_EMAILS accounts that proved the mailbox and hold the admin
 * role. Only they manage the team: an ordinary admin cannot ban, demote, remove, edit or reset
 * the password of an owner or of anyone on the team, nor bring someone into it.
 */
export function isPlatformOwner(account: AccountIdentity, ownerEmails: readonly string[]): boolean {
  return (
    account.emailVerified &&
    rolesOf(account.role).includes("admin") &&
    isOwnerEmail(account.email, ownerEmails)
  );
}

/**
 * Accounts only an owner may change: anyone on the team and any ADMIN_EMAILS address, verified or
 * not (whoever registered an owner's address first must not be left to every admin either).
 */
export function isProtectedAccount(
  account: Pick<AccountIdentity, "email" | "role">,
  ownerEmails: readonly string[],
): boolean {
  const onTeam = rolesOf(account.role).some((role) => staffRoleOf(role) !== null);
  return onTeam || isOwnerEmail(account.email, ownerEmails);
}

/**
 * Whether `actor` may act on an account in this state. A change is checked on both sides: the
 * account as it is and as it would become (a new team role, an owner's e-mail address).
 */
export function canManageAccount(
  actor: AccountIdentity,
  target: Pick<AccountIdentity, "email" | "role">,
  ownerEmails: readonly string[],
): boolean {
  if (!isProtectedAccount(target, ownerEmails)) {
    return true;
  }
  return isPlatformOwner(actor, ownerEmails);
}
