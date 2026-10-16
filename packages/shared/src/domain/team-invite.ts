import { STAFF_ROLE_LABELS, staffRoleOf, type StaffRole } from "./staff-access.ts";

/** The account already registered with the invited address, if any. */
export interface InvitedAccount {
  id: string;
  email: string;
  role: string | null | undefined;
  emailVerified: boolean;
}

export type TeamInvitePlan =
  | { kind: "create" }
  | { kind: "promote"; userId: string; previousRole: StaffRole }
  | { kind: "refuse"; reason: string };

/**
 * What inviting `email` into `role` does (item 28.a): a new address gets an account with the
 * role and a link to create the password; someone already on the team gets the new role.
 * Everything else is refused, because the invite would hand the role to the wrong person:
 * - an address nobody proved (whoever registered it first would get in with their password);
 * - a customer's account (it keeps the store; the customer page still does that on purpose);
 * - an owner address, which ADMIN_EMAILS manages (auth.ts promotes and resets it on its own).
 */
export function planTeamInvite(
  email: string,
  existing: InvitedAccount | null,
  role: StaffRole,
  ownerEmails: readonly string[],
): TeamInvitePlan {
  if (ownerEmails.includes(email.toLowerCase())) {
    return {
      kind: "refuse",
      reason:
        "Este e-mail é de um dono da plataforma: ele entra pela configuração, não por convite",
    };
  }
  if (existing === null) {
    return { kind: "create" };
  }
  if (!existing.emailVerified) {
    return {
      kind: "refuse",
      reason:
        "Já existe uma conta com este e-mail, mas ela não confirmou o e-mail. Peça para a pessoa confirmar antes do convite",
    };
  }
  const current = staffRoleOf(existing.role);
  if (current === null) {
    return {
      kind: "refuse",
      reason:
        "Este e-mail é de uma conta de cliente. Para levá-la à equipe, mude o papel na ficha do cliente",
    };
  }
  if (current === role) {
    return {
      kind: "refuse",
      reason: `Esta pessoa já faz parte da equipe como ${STAFF_ROLE_LABELS[role]}`,
    };
  }
  return { kind: "promote", userId: existing.id, previousRole: current };
}
