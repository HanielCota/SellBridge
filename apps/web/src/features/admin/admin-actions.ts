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
  "profile_updated",
  "role_changed",
  "ban_changed",
  "sessions_revoked",
  "password_reset_sent",
  "onboarding_reminder_sent",
  "region_updated",
  "store_disconnected",
  "issue_assigned",
  "issue_released",
  "issue_snoozed",
  "issue_unsnoozed",
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

const ACTION_COPY: Record<AdminAction, (details: AdminEventDetails | null) => string> = {
  impersonated: () => "Entrou como o cliente",
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
  region_updated: (details) => `Mudou a região${details?.state ? ` para ${details.state}` : ""}`,
  store_disconnected: () => "Desconectou uma loja",
  issue_assigned: (details) => `Assumiu: ${issueLabel(details)}`,
  issue_released: (details) => `Devolveu à equipe: ${issueLabel(details)}`,
  issue_snoozed: (details) =>
    `Adiou por ${details?.days ?? "alguns"} ${details?.days === 1 ? "dia" : "dias"}: ${issueLabel(details)}`,
  issue_unsnoozed: (details) => `Retomou: ${issueLabel(details)}`,
};

/** One line of the customer's timeline, in the admin's words. */
export function describeAdminEvent(action: string, details: AdminEventDetails | null): string {
  if (!isAdminAction(action)) {
    return "Ação do administrador";
  }
  return ACTION_COPY[action](details);
}
