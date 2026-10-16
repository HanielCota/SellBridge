import { STAFF_ROLE_LABELS, staffRoleOf, type StaffRole } from "./staff-access.ts";

/** The account already registered with the invited address, if any. */
export interface InvitedAccount {
  id: string;
  email: string;
  role: string | null | undefined;
}

export type TeamInvitePlan =
  { kind: "create" } | { kind: "promote"; userId: string } | { kind: "refuse"; reason: string };

/**
 * What inviting `email` into `role` does (item 28.a): a new address gets an account with the
 * role and a link to set the password; an existing account gets the role. An owner's address is
 * always admin (auth.ts promotes it back), so it can't be invited into a smaller role.
 */
export function planTeamInvite(
  existing: InvitedAccount | null,
  role: StaffRole,
  ownerEmails: readonly string[],
): TeamInvitePlan {
  if (existing === null) {
    return { kind: "create" };
  }
  if (role !== "admin" && ownerEmails.includes(existing.email.toLowerCase())) {
    return {
      kind: "refuse",
      reason: "Este e-mail é de um dono da plataforma e é sempre administrador",
    };
  }
  if (staffRoleOf(existing.role) === role) {
    return {
      kind: "refuse",
      reason: `Esta pessoa já faz parte da equipe como ${STAFF_ROLE_LABELS[role]}`,
    };
  }
  return { kind: "promote", userId: existing.id };
}
