import { formatCents } from "@sellbridge/shared/money";

/** Where the money of a refund or protected-payment problem stands. */
export type MoneyProblemState =
  | { kind: "manual_refund"; amountCents: number; refunded: boolean }
  | { kind: "held_payment"; amountCents: number; decidable: boolean };

export interface ResolveConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
}

function moneyStillWaits(state: MoneyProblemState): boolean {
  if (state.kind === "manual_refund") {
    return !state.refunded;
  }
  return state.decidable;
}

/**
 * The question "Marcar como resolvido" asks while the money has not moved yet: resolving takes
 * the problem off the open list, so nobody would be reminded of it. Null once the money moved.
 */
export function moneyResolveConfirmation(state: MoneyProblemState): ResolveConfirmation | null {
  if (!moneyStillWaits(state)) {
    return null;
  }
  const amount = formatCents(state.amountCents);
  if (state.kind === "manual_refund") {
    return {
      title: "O dinheiro já voltou ao revendedor?",
      description: `O Asaas ainda não confirmou a devolução de ${amount}. Marcando como resolvido, ela sai da lista de problemas em aberto e ninguém mais é lembrado dela. Marque só se o revendedor já recebeu o dinheiro.`,
      confirmLabel: "Já voltou, marcar como resolvido",
    };
  }
  return {
    title: "Resolver sem decidir o pagamento?",
    description: `Ninguém escolheu ainda se os ${amount} guardados voltam ao revendedor ou vão ao fornecedor. Marcando como resolvido, o pagamento sai da lista de problemas em aberto sem decisão.`,
    confirmLabel: "Marcar como resolvido sem decidir",
  };
}

/** The line under the button while the money waits; null once it moved. */
export function moneyResolveHint(state: MoneyProblemState): string | null {
  if (!moneyStillWaits(state)) {
    return null;
  }
  if (state.kind === "manual_refund") {
    return "Marque depois que o Asaas confirmar a devolução: o pagamento aparece como devolvido aqui sozinho.";
  }
  return "Escolha acima para onde vai o dinheiro; depois marque como resolvido.";
}
