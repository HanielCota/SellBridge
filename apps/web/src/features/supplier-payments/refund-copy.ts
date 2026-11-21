import { formatCents } from "@sellbridge/shared/money";
import { formatDeadlineDay } from "@/lib/relative-time";
import type {
  ShipmentPaymentRefundReason,
  SupplierPaymentBadge,
} from "@sellbridge/shared/shipment-payments";

const REASON_SENTENCES: Record<ShipmentPaymentRefundReason, string> = {
  not_dispatched: "O fornecedor não postou o envio no prazo.",
  cancelled: "O envio foi cancelado.",
  returned: "O envio voltou para o fornecedor.",
  not_delivered: "O envio não foi entregue.",
  team: "Nossa equipe analisou o caso e decidiu devolver o pagamento.",
};

const GATEWAY_NAMES = { mercado_pago: "Mercado Pago", asaas: "Asaas" } as const;

export interface RefundView {
  reason: ShipmentPaymentRefundReason | null;
  /** The provider refused the refund: the team takes it from here. */
  failed: boolean;
}

/** A refund the team makes by hand, asked for through a support ticket. */
export interface ManualRefundView {
  /** The ticket already open about the order, or null while the reseller has not asked. */
  ticketId: string | null;
  /** The last moment before Asaas releases the money to the supplier (ISO), or null when unknown. */
  askUntil: string | null;
}

/** Who gives the money back, and what the reseller does next: ask, or follow the ticket. */
function manualRefundSentence(manual: ManualRefundView, amount: string, now: Date): string {
  const who = `Quem devolve os ${amount} é a equipe do SellBridge.`;
  if (manual.ticketId !== null) {
    return `${who} Seu pedido de devolução já está com a equipe: a resposta chega no chamado.`;
  }
  if (manual.askUntil === null) {
    return `${who} Peça a devolução pelo botão abaixo.`;
  }
  const askUntil = new Date(manual.askUntil);
  if (now.getTime() > askUntil.getTime()) {
    return `${who} O Asaas já liberou o valor ao fornecedor, então a equipe acerta a devolução com ele. Peça pelo botão abaixo.`;
  }
  const day = formatDeadlineDay(askUntil, now);
  return `${who} Peça a devolução pelo botão abaixo: o prazo vai até ${day}, e depois dessa data o Asaas libera o valor ao fornecedor.`;
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
  /** The gateway the payment went through; Mercado Pago when not said. */
  provider?: keyof typeof GATEWAY_NAMES | null;
  /** Set when the team gives the money back by hand. */
  manualRefund?: ManualRefundView | null;
  now?: Date;
}): string | null {
  const { badge, refund } = input;
  const amount = formatCents(input.amountCents);
  const gateway = GATEWAY_NAMES[input.provider ?? "mercado_pago"];
  if (badge.kind === "refunded") {
    if (refund === null) {
      return `O pagamento voltou para você no ${gateway}.`;
    }
    return withReason(refund.reason, `Devolvemos ${amount} para você pelo ${gateway}.`);
  }
  if (badge.kind !== "refunding" || refund === null) {
    return null;
  }
  if (refund.failed && input.manualRefund != null) {
    return withReason(
      refund.reason,
      manualRefundSentence(input.manualRefund, amount, input.now ?? new Date()),
    );
  }
  if (refund.failed) {
    return withReason(
      refund.reason,
      `O ${gateway} não aceitou devolver ${amount}. Nossa equipe já foi avisada e vai falar com você.`,
    );
  }
  return withReason(refund.reason, `Estamos devolvendo ${amount} para você pelo ${gateway}.`);
}
