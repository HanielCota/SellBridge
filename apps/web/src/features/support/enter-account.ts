import type { ProfileKind } from "@sellbridge/shared/profile-kind";

export interface EnterAccountAction {
  label: string;
  hint: string;
  /** Where the visit opens: a supplier's work is on its panel, a reseller's on the overview. */
  path: string;
}

/**
 * The "Entrar como…" shortcut on a ticket. Agents and supervisors only get it while the ticket
 * is not closed, the same rule the server applies (`impersonation-access`); an admin always.
 * Hiding it is a courtesy: the auth hook refuses the visit whatever the screen shows.
 */
export function enterAccountAction(input: {
  tenantKind: ProfileKind;
  ticketStatus: string;
  isSelf: boolean;
  canImpersonate: boolean;
  canManageCustomers: boolean;
}): EnterAccountAction | null {
  if (!input.canImpersonate || input.isSelf) {
    return null;
  }
  if (!input.canManageCustomers && input.ticketStatus === "closed") {
    return null;
  }
  if (input.tenantKind === "supplier") {
    return {
      label: "Entrar como fornecedor",
      hint: "Entrar como fornecedor para fazer o ajuste no painel dele",
      path: "/fornecedor/painel",
    };
  }
  return {
    label: "Entrar como cliente",
    hint: "Entrar como cliente para fazer o ajuste na conta",
    path: "/dashboard",
  };
}
