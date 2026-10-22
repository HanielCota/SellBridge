import type { AdminEventDetails } from "@sellbridge/database/repositories";
import {
  CUSTOMER_ISSUE_KINDS,
  CUSTOMER_ROLE_LABELS,
  CUSTOMER_ROLES,
} from "@sellbridge/shared/schemas";
import { ISSUE_KIND_LABELS } from "./issue-copy";

/** Everything an admin can do to a customer's account that lands in its timeline. */
export const ADMIN_ACTIONS = [
  "impersonated",
  "impersonation_ended",
  "acted_as_customer",
  "email_changed",
  "profile_updated",
  "role_changed",
  "ban_changed",
  "sessions_revoked",
  "password_reset_sent",
  "onboarding_reminder_sent",
  "region_updated",
  "store_supplier_changed",
  "store_disconnected",
  "issue_assigned",
  "issue_released",
  "issue_snoozed",
  "issue_unsnoozed",
  "team_invited",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

function isAdminAction(action: string): action is AdminAction {
  return ADMIN_ACTIONS.some((known) => known === action);
}

function issueLabel(details: AdminEventDetails | null): string {
  const issue = details?.issue;
  const kind = CUSTOMER_ISSUE_KINDS.find((known) => known === issue);
  return kind ? ISSUE_KIND_LABELS[kind].toLowerCase() : "pendência";
}

/**
 * What an admin did inside the customer's account, by server function (see
 * `lib/server/impersonation.ts`). Anything not listed reads as a generic change.
 */
export const IMPERSONATED_ACTION_COPY: Readonly<Record<string, string>> = {
  forwardOrderFn: "encaminhou um pedido",
  restartOwnShipmentFn: "retomou a preparação do próprio envio",
  reforwardShipmentFn: "reencaminhou um envio",
  updateShipmentFn: "atualizou um envio",
  rotateSupplierLinkFn: "gerou um novo link do fornecedor",
  revokeSupplierLinkFn: "cancelou o link do fornecedor",
  refreshMarketplaceTrackingFn: "atualizou o rastreio",
  createListing: "publicou um produto",
  publishProductsInBulk: "publicou produtos em massa",
  retryListings: "reprocessou publicações",
  setListingsPausedFn: "pausou ou reativou publicações",
  updateListingPriceFn: "mudou o preço de uma publicação",
  saveSupplierReviewFn: "avaliou um fornecedor",
  clearNotificationsFn: "limpou os avisos",
  closeMyTicket: "encerrou um chamado",
  rateMyTicket: "avaliou um chamado",
  saveOnboardingSupplier: "escolheu o fornecedor inicial",
  saveOnboardingProductSources: "alterou a origem dos produtos",
  // Routes outside the server functions, named "area.action".
  "support.createTicket": "abriu um chamado",
  "support.reply": "respondeu um chamado",
  "profile.update": "mudou o nome ou a foto do perfil",
};

function impersonatedActionLabel(details: AdminEventDetails | null): string {
  const action = details?.action;
  const label = typeof action === "string" ? IMPERSONATED_ACTION_COPY[action] : undefined;
  return label ?? "fez uma alteração";
}

/** "Entrou como o fornecedor pelo chamado #6CFB95": who was entered and, for the team, why. */
function visitLabel(details: AdminEventDetails | null): string {
  const who = details?.profileKind === "supplier" ? "o fornecedor" : "o cliente";
  const ticket = details?.ticketCode;
  const reason = typeof ticket === "string" ? ` pelo chamado #${ticket}` : "";
  return `Entrou como ${who}${reason}`;
}

const ACTION_COPY: Record<AdminAction, (details: AdminEventDetails | null) => string> = {
  impersonated: (details) => visitLabel(details),
  impersonation_ended: () => "Saiu da conta do cliente",
  acted_as_customer: (details) => `Como o cliente: ${impersonatedActionLabel(details)}`,
  email_changed: () => "Trocou o e-mail (aguarda confirmação)",
  profile_updated: () => "Editou nome ou e-mail",
  role_changed: (details) => {
    const role = CUSTOMER_ROLES.find((known) => known === details?.role);
    return role
      ? `Definiu o papel como ${CUSTOMER_ROLE_LABELS[role].toLowerCase()}`
      : "Mudou o papel";
  },
  ban_changed: (details) => (details?.banned ? "Bloqueou a conta" : "Desbloqueou a conta"),
  sessions_revoked: () => "Encerrou as sessões",
  password_reset_sent: () => "Enviou redefinição de senha",
  onboarding_reminder_sent: () => "Enviou lembrete dos primeiros passos",
  // Kept for the history of accounts changed before the address stopped being asked for.
  region_updated: (details) => `Mudou a região${details?.state ? ` para ${details.state}` : ""}`,
  store_supplier_changed: (details) =>
    `Trocou o fornecedor de uma loja${details?.supplierName ? ` para ${details.supplierName}` : ""}`,
  store_disconnected: () => "Desconectou uma loja",
  issue_assigned: (details) => `Assumiu: ${issueLabel(details)}`,
  issue_released: (details) => `Devolveu à equipe: ${issueLabel(details)}`,
  issue_snoozed: (details) =>
    `Adiou por ${details?.days ?? "alguns"} ${details?.days === 1 ? "dia" : "dias"}: ${issueLabel(details)}`,
  issue_unsnoozed: (details) => `Retomou: ${issueLabel(details)}`,
  team_invited: (details) => {
    const role = CUSTOMER_ROLES.find((known) => known === details?.role);
    const as = role ? ` como ${CUSTOMER_ROLE_LABELS[role].toLowerCase()}` : "";
    return details?.resent
      ? `Reenviou o convite para a equipe${as}`
      : `Convidou para a equipe${as}`;
  },
};

/** One line of the customer's timeline, in the admin's words. */
export function describeAdminEvent(action: string, details: AdminEventDetails | null): string {
  if (!isAdminAction(action)) {
    return "Ação do administrador";
  }
  return ACTION_COPY[action](details);
}
