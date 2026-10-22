import { hasStaffPermission } from "./staff-access.ts";

/*
 * Who may open a customer's account as the customer ("Entrar como cliente"). Admins enter any
 * customer; agents and supervisors only a customer who is waiting on support, so a visit always
 * has a ticket behind it. Nobody enters a team account, their own included.
 */

export interface ImpersonationParty {
  id: string;
  role: string | null;
}

export interface ImpersonationRequest {
  actor: ImpersonationParty;
  target: ImpersonationParty;
  /** A ticket not closed, opened by the target or by a profile the target belongs to. */
  targetHasOpenTicket: boolean;
}

export type ImpersonationRefusal = "not_staff" | "self" | "team_account" | "no_open_ticket";

export const IMPERSONATION_REFUSAL_MESSAGES: Readonly<Record<ImpersonationRefusal, string>> = {
  not_staff: "Só a equipe do SellBridge pode entrar na conta de um cliente.",
  self: "Você não pode entrar na sua própria conta por aqui.",
  team_account: "Ninguém entra na conta de um membro da equipe.",
  no_open_ticket:
    "Só dá para entrar na conta de quem tem um chamado aberto. Peça ao cliente para abrir um chamado.",
};

/**
 * An allow-list, not "not a team role": a combined role ("user,agent", which the plugin splits)
 * or one added later must never make a team account enterable.
 */
function isCustomerRole(role: string | null): boolean {
  return role === null || role === "user";
}

/** Why the visit is refused, or null when it may go ahead. */
export function impersonationRefusal(request: ImpersonationRequest): ImpersonationRefusal | null {
  const { actor, target } = request;
  if (!hasStaffPermission(actor.role, "customers.impersonate")) {
    return "not_staff";
  }
  if (actor.id === target.id) {
    return "self";
  }
  if (!isCustomerRole(target.role)) {
    return "team_account";
  }
  // Admins handle any account (`customers.manage`); the rest of the team needs a ticket.
  if (hasStaffPermission(actor.role, "customers.manage")) {
    return null;
  }
  return request.targetHasOpenTicket ? null : "no_open_ticket";
}
