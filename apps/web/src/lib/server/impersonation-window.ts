import { unauthorizedError } from "@sellbridge/shared/errors";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";

/** Shown when an admin's visit to a customer's account ended (time up, or the admin lost access). */
export const VISIT_OVER_MESSAGE = "O acesso como cliente terminou. Volte ao admin.";

/** How long "Entrar como cliente" lasts before the admin is out of the customer's account. */
export const IMPERSONATION_SECONDS = 60 * 60;

/**
 * Whether an admin's visit started too long ago. Checked on the server from when the session was
 * created: Better Auth renews sessions on use unless a browser cookie says otherwise.
 */
export function isImpersonationOver(startedAt: Date, now: Date = new Date()): boolean {
  // An unreadable start date ends the visit rather than keeping it open forever.
  if (Number.isNaN(startedAt.getTime())) {
    return true;
  }
  return now.getTime() - startedAt.getTime() > IMPERSONATION_SECONDS * 1000;
}

/**
 * Refuses a session from an admin's visit that is over. Every route that reads the session on
 * its own (the tenant check, the profile photo, Better Auth's profile route) calls this.
 */
export function assertVisitNotOver(session: {
  impersonatedBy?: string | null | undefined;
  createdAt: Date | string;
}): void {
  if (!session.impersonatedBy || !isImpersonationOver(new Date(session.createdAt))) {
    return;
  }
  throw unauthorizedError(VISIT_OVER_MESSAGE);
}

export interface VisitingStaff {
  readonly role: string | null;
  readonly banned: boolean;
}

/**
 * Whether the team member behind a visit may still be inside the customer's account. The visit
 * session belongs to the customer, so banning or demoting the team member deletes none of it:
 * the role and the ban are read again on every request of the visit.
 */
export function mayKeepVisiting(visitor: VisitingStaff | null): boolean {
  if (visitor === null) {
    return false;
  }

  if (visitor.banned) {
    return false;
  }

  return hasStaffPermission(visitor.role, "customers.impersonate");
}
