import { forbiddenError } from "@sellbridge/shared/errors";

/*
 * What the team may do inside a customer's account, as plain rules with no database: the server
 * functions' middleware, the support routes and the tests all read them from here.
 */

/**
 * Server functions the team must not run inside a customer's account, with what the refusal
 * says: they outlive the session (keys, webhooks), cut the shop off (stores), move money,
 * change who is billed or where a supplier's orders go. Matched by the function's name: a test checks every name still exists.
 */
export const BLOCKED_WHILE_IMPERSONATING: Readonly<Record<string, string>> = {
  createApiKeyFn: "criar chaves de API",
  revokeApiKeyFn: "revogar chaves de API",
  createWebhookEndpointFn: "criar webhooks",
  deleteWebhookEndpointFn: "excluir webhooks",
  setWebhookEndpointEnabledFn: "ligar ou desligar webhooks",
  disconnectStoreFn: "desconectar lojas",
  checkoutBilling: "assinar um plano",
  manageBilling: "mudar a assinatura",
  saveOnboardingHolder: "mudar os dados do titular",
  // The supplier's company data and orders e-mail travel together in the brand form. A first
  // brand may be registered during a visit, see `assertVisitKeepsOrdersEmail`.
  updateOwnBrandFn: "mudar os dados da empresa ou o e-mail de pedidos",
  acceptTermsFn: "aceitar os termos de uso",
  // A ticket opened in the customer's name would keep the account open to the team after the
  // ticket that justified the visit is closed. Named "area.action": it is an HTTP route.
  "support.createTicket": "abrir um chamado em nome do cliente",
  // The rating feeds the team's satisfaction metrics: an agent inside the account would grade
  // their own service in the customer's name.
  rateMyTicket: "avaliar o atendimento",
};

/** Writes too small to land in the customer's timeline (read markers). */
export const QUIET_WHILE_IMPERSONATING: ReadonlySet<string> = new Set([
  "markNotificationsSeenFn",
  "markMyTicketRead",
]);

export interface ImpersonatedCall {
  /** The admin behind the session, or null for the customer's own session. */
  impersonatedBy: string | null;
  customerId: string;
  functionName: string;
  method: string;
}

/** Throws when the call is one an admin may not make as the customer. */
export function assertAllowedWhileImpersonating(call: ImpersonatedCall): void {
  if (typeof call.impersonatedBy !== "string") {
    return;
  }
  const action = BLOCKED_WHILE_IMPERSONATING[call.functionName];
  if (action === undefined) {
    return;
  }
  throw forbiddenError(`Não é possível ${action} durante o acesso como cliente`);
}

/** Whether a call that went through is recorded in the customer's timeline under the admin. */
export function isRecordedImpersonatedCall(call: ImpersonatedCall): boolean {
  return (
    typeof call.impersonatedBy === "string" &&
    call.method === "POST" &&
    !QUIET_WHILE_IMPERSONATING.has(call.functionName)
  );
}

/**
 * A supplier without a brand cannot receive products or orders, and registering it is often what
 * the supplier needs help with. During a visit the team may register it, but the orders e-mail
 * stays the account's own: the team never decides where a supplier's orders go.
 */
export function assertVisitKeepsOrdersEmail(input: {
  impersonatedBy: string | null;
  loginEmail: string;
  ordersEmail: string | null;
}): void {
  if (input.impersonatedBy === null || input.ordersEmail === null) {
    return;
  }
  if (input.ordersEmail.trim().toLowerCase() === input.loginEmail.trim().toLowerCase()) {
    return;
  }
  throw forbiddenError(
    "Durante o acesso como cliente, o e-mail de pedidos fica com o e-mail da conta do fornecedor",
  );
}

/**
 * A customer's message reopens a closed ticket, and an open ticket lets agents and supervisors
 * into the account. During a visit the team would reopen it in the customer's name and keep the
 * door open after the ticket that justified the visit is closed, so that reply is refused.
 */
export function assertVisitKeepsTicketClosed(input: {
  impersonatedBy: string | null;
  ticketStatus: string;
}): void {
  if (input.impersonatedBy === null || input.ticketStatus !== "closed") {
    return;
  }
  throw forbiddenError(
    "Durante o acesso como cliente, não é possível reabrir um chamado encerrado",
  );
}
