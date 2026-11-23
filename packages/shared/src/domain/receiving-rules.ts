/**
 * The admin's two switches for paying suppliers only through SellBridge (Guilherme, 18/11/2026):
 * a supplier needs an approved Asaas account to sell, and, on top of that, prepares a parcel
 * only after the reseller paid it. Both stay off until Asaas runs in production.
 */

/** Each switch keeps the instant it was turned on; null while it is off. */
export interface ReceivingRules {
  readonly receivingAccountSince: Date | null;
  readonly paymentBeforePreparingSince: Date | null;
}

export const RECEIVING_RULES_OFF: ReceivingRules = {
  receivingAccountSince: null,
  paymentBeforePreparingSince: null,
};

/** What the admin asks for on the settings screen. */
export interface ReceivingRulesChoice {
  readonly requireReceivingAccount: boolean;
  readonly paymentBeforePreparing: boolean;
}

export const PAYMENT_NEEDS_ACCOUNT_MESSAGE =
  "Ligue antes “Exigir conta de recebimento para vender”: sem a conta, o revendedor não tem como pagar o fornecedor.";
export const ASAAS_OFF_MESSAGE =
  "O Asaas ainda não está ligado no SellBridge. Sem ele, nenhum fornecedor recebe e as vendas parariam.";

/**
 * Why the admin cannot save this choice, or null when it can: paying first needs the account
 * rule, and turning either one on needs Asaas configured on the server.
 */
export function receivingRulesRefusal(
  choice: ReceivingRulesChoice,
  asaasAvailable: boolean,
): string | null {
  if (choice.paymentBeforePreparing && !choice.requireReceivingAccount) {
    return PAYMENT_NEEDS_ACCOUNT_MESSAGE;
  }
  if ((choice.requireReceivingAccount || choice.paymentBeforePreparing) && !asaasAvailable) {
    return ASAAS_OFF_MESSAGE;
  }
  return null;
}

/**
 * The instants to save: a switch already on keeps the instant it was turned on, so parcels
 * forwarded before it never start waiting; a switch turned off forgets it.
 */
export function nextReceivingRules(
  current: ReceivingRules,
  choice: ReceivingRulesChoice,
  now: Date,
): ReceivingRules {
  return {
    receivingAccountSince: choice.requireReceivingAccount
      ? (current.receivingAccountSince ?? now)
      : null,
    paymentBeforePreparingSince: choice.paymentBeforePreparing
      ? (current.paymentBeforePreparingSince ?? now)
      : null,
  };
}

/**
 * Why a parcel waits before the supplier may prepare it: the supplier has no approved receiving
 * account, or the reseller has not paid it through Asaas yet.
 */
export const PREPARATION_HOLDS = ["receiving_account", "payment"] as const;
export type PreparationHold = (typeof PREPARATION_HOLDS)[number];

export function preparationHoldFrom(value: string | null): PreparationHold | null {
  return PREPARATION_HOLDS.find((hold) => hold === value) ?? null;
}

/** The parcel's situation, the same words on every screen. */
export const PREPARATION_HOLD_LABELS: Record<PreparationHold, string> = {
  receiving_account: "Aguardando o fornecedor ligar a conta de recebimento",
  payment: "Aguardando pagamento do revendedor",
};

/** What the supplier reads on the parcel, with what to do. */
export const SUPPLIER_HOLD_MESSAGES: Record<PreparationHold, string> = {
  receiving_account:
    "Ligue sua conta de recebimento no Asaas para aceitar este pedido. O revendedor paga você por ela.",
  payment:
    "O revendedor ainda não pagou este pedido. Assim que o pagamento cair no Asaas, você aceita e prepara, e seus prazos começam a contar.",
};

/** What the reseller reads on the parcel, with what to do. */
export const RESELLER_HOLD_MESSAGES: Record<PreparationHold, string> = {
  receiving_account:
    "O fornecedor ainda não ligou a conta de recebimento. Ele e a nossa equipe já foram avisados; o pedido segue assim que a conta for aprovada.",
  payment:
    "Pague o fornecedor para ele começar a preparar o pedido. O prazo de postagem do marketplace continua correndo.",
};

/** Why a supplier step was refused while the parcel waits. */
export const HOLD_REFUSALS: Record<PreparationHold, string> = {
  receiving_account:
    "Este pedido espera o fornecedor ligar a conta de recebimento no Asaas. Depois disso, ele pode seguir.",
  payment:
    "Este pedido espera o pagamento do revendedor pelo Asaas. Depois do pagamento, ele pode seguir.",
};

/** Why a product of a supplier without an approved receiving account cannot be published. */
export const SUPPLIER_WITHOUT_RECEIVING_MESSAGE =
  "Este fornecedor ainda não tem a conta de recebimento aprovada no SellBridge. Os produtos dele voltam a poder ser publicados quando a conta for aprovada.";

/** The parcel's situation as the supplier reads it, on its badge. */
export const SUPPLIER_HOLD_LABELS: Record<PreparationHold, string> = {
  receiving_account: "Aguardando sua conta de recebimento",
  payment: "Aguardando pagamento do revendedor",
};
