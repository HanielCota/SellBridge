/**
 * Where a supplier receives the resellers' payments: Mercado Pago (money at once) or Asaas (money
 * held until delivery). The supplier chooses; a new supplier may be held to Asaas by an admin rule.
 */

export const PAYMENT_PROVIDERS = ["mercado_pago", "asaas"] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

/** Where Asaas's review of a supplier account's documents stands. */
export const PAYMENT_ACCOUNT_REVIEW_STATUSES = [
  "pending",
  "awaiting_approval",
  "approved",
  "rejected",
] as const;
export type PaymentAccountReviewStatus = (typeof PAYMENT_ACCOUNT_REVIEW_STATUSES)[number];

/** Default number of confirmed deliveries before a new supplier may receive without protection. */
export const DEFAULT_NEW_SUPPLIER_DELIVERIES = 5;
export const MAX_NEW_SUPPLIER_DELIVERIES = 1000;

/**
 * Asaas's general account status (`APPROVED`, `AWAITING_APPROVAL`, `PENDING`, `REJECTED`) as kept
 * here. An unknown value stays pending: an account is never treated as approved by mistake.
 */
export function reviewStatusFromAsaas(general: string): PaymentAccountReviewStatus {
  const known: Record<string, PaymentAccountReviewStatus> = {
    APPROVED: "approved",
    AWAITING_APPROVAL: "awaiting_approval",
    REJECTED: "rejected",
  };
  return known[general] ?? "pending";
}

export interface NewSupplierRule {
  readonly enabled: boolean;
  /** Confirmed deliveries needed before Mercado Pago (no protection) is allowed. */
  readonly deliveries: number;
}

export interface ReceivingSituation {
  readonly mercadoPagoUsable: boolean;
  /** An Asaas account approved by Asaas, with its protection on. */
  readonly asaasUsable: boolean;
  /** What the supplier chose on Recebimentos, or null if it never chose. */
  readonly choice: PaymentProviderName | null;
  readonly rule: NewSupplierRule;
  /** The supplier's parcels whose delivery the marketplace or the reseller confirmed. */
  readonly confirmedDeliveries: number;
}

export type ReceivingProvider =
  | { readonly provider: PaymentProviderName; readonly heldByRule: boolean }
  | { readonly provider: null; readonly reason: "no_account" | "protection_required" };

/** Whether the admin rule keeps this supplier on protected payments for now. */
export function mustReceiveProtected(rule: NewSupplierRule, confirmedDeliveries: number): boolean {
  return rule.enabled && confirmedDeliveries < rule.deliveries;
}

/**
 * The provider a new payment to this supplier goes through: its choice when that account is
 * usable, else the other usable one (Mercado Pago first); Asaas only while the new-supplier rule
 * applies.
 */
export function receivingProviderFor(situation: ReceivingSituation): ReceivingProvider {
  const heldByRule = mustReceiveProtected(situation.rule, situation.confirmedDeliveries);
  if (heldByRule) {
    return situation.asaasUsable
      ? { provider: "asaas", heldByRule }
      : { provider: null, reason: "protection_required" };
  }
  const usable: Record<PaymentProviderName, boolean> = {
    mercado_pago: situation.mercadoPagoUsable,
    asaas: situation.asaasUsable,
  };
  if (situation.choice !== null && usable[situation.choice]) {
    return { provider: situation.choice, heldByRule };
  }
  const fallback = PAYMENT_PROVIDERS.find((provider) => usable[provider]);
  return fallback === undefined
    ? { provider: null, reason: "no_account" }
    : { provider: fallback, heldByRule };
}
