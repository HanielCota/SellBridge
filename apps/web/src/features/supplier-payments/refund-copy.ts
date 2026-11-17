import { formatCents } from "@sellbridge/shared/money";
import type {
  ShipmentPaymentRefundReason,
  SupplierPaymentBadge,
} from "@sellbridge/shared/shipment-payments";

const REASON_SENTENCES: Record<ShipmentPaymentRefundReason, string> = {
  not_dispatched: "O fornecedor não postou o envio no prazo.",
  cancelled: "O envio foi cancelado.",
  returned: "O envio voltou para o fornecedor.",
};

export interface RefundView {
  reason: ShipmentPaymentRefundReason | null;
  /** Mercado Pago refused the refund: the team takes it from here. */
  failed: boolean;
}

function withReason(reason: ShipmentPaymentRefundReason | null, sentence: string): string {
  if (reason === null) {
    return sentence;
  }
  return `${REASON_SENTENCES[reason]} ${sentence}`;
}

/**
 * What the reseller reads under the badge once the supplier payment goes back, or null while it
 * does not: why, how much, and who acts next.
 */
export function resellerRefundText(input: {
  badge: SupplierPaymentBadge;
  refund: RefundView | null;
  amountCents: number;
}): string | null {
  const { badge, refund } = input;
  const amount = formatCents(input.amountCents);
  if (badge.kind === "refunded") {
    if (refund === null) {
      return "O pagamento voltou para você no Mercado Pago.";
    }
    return withReason(refund.reason, `Devolvemos ${amount} para você pelo Mercado Pago.`);
  }
  if (badge.kind !== "refunding" || refund === null) {
    return null;
  }
  if (refund.failed) {
    return withReason(
      refund.reason,
      `O Mercado Pago não aceitou devolver ${amount}. Nossa equipe já foi avisada e vai falar com você.`,
    );
  }
  return withReason(refund.reason, `Estamos devolvendo ${amount} para você pelo Mercado Pago.`);
}
