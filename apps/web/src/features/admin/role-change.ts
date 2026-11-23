import { CUSTOMER_ROLE_LABELS, type CustomerRole } from "@sellbridge/shared/schemas";

/** How much a role sees: a step up needs the admin to read what it gives, a step down does not. */
const ROLE_REACH: Readonly<Record<CustomerRole, number>> = {
  user: 0,
  agent: 1,
  supervisor: 2,
  admin: 3,
};

/** What each team role opens, said to whoever is about to give it. */
const WHAT_THE_ROLE_SEES: Readonly<Record<Exclude<CustomerRole, "user">, string>> = {
  agent:
    "lê e responde os chamados de todos os clientes e entra na conta de quem tem chamado aberto.",
  supervisor:
    "lê, distribui e responde os chamados, vê o desempenho do suporte, decide o crédito das devoluções e entra na conta de quem tem chamado aberto.",
  admin:
    "vê e muda todos os clientes e fornecedores, os pagamentos e as configurações, e entra na conta de qualquer cliente.",
};

export interface RoleChangeConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
}

/**
 * The question asked before giving more access, with what the person will see; null for a change
 * to less access, which applies at once with "Desfazer" on the notice. The server still checks
 * that the one asking may change roles.
 */
export function roleChangeConfirmation(input: {
  name: string;
  from: CustomerRole;
  to: CustomerRole;
}): RoleChangeConfirmation | null {
  const { name, from, to } = input;
  if (to === "user" || ROLE_REACH[to] <= ROLE_REACH[from]) {
    return null;
  }
  const label = CUSTOMER_ROLE_LABELS[to];
  return {
    title: `Tornar ${name} ${label}?`,
    description: `Como ${label}, ${name} ${WHAT_THE_ROLE_SEES[to]}`,
    confirmLabel: `Tornar ${label}`,
  };
}

/** The notice after the change, e.g. "Daniel Souza agora é Administrador". */
export function roleChangedMessage(name: string, to: CustomerRole): string {
  return `${name} agora é ${CUSTOMER_ROLE_LABELS[to]}`;
}
