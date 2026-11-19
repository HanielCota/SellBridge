import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import type { StatusTone } from "@/components/data/tone-status";

/** A buyer's claim as the order screens read it (`listOrderClaims`). */
export interface ClaimView {
  externalClaimId: string;
  status: "opened" | "closed";
  type: string;
  stage: string;
  reasonId: string | null;
  problem: string | null;
  actionResponsible: "seller" | "buyer" | "mediator" | null;
  actionDueAt: Date | null;
  resolutionReason: string | null;
  closedAt: Date | null;
  returnStatus: string | null;
  returnTrackingCode: string | null;
  returnDestination: "seller" | "marketplace" | null;
  moneyStatus: "retained" | "refunded" | "available" | null;
  openedAt: Date;
}

/** The reseller answers the buyer and sees the money; the supplier only follows the claim. */
export type ClaimReader = "reseller" | "supplier";

// Brazil time: a deadline at 23:59 must not show the next day.
const dayMonth = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: REPORT_TIME_ZONE,
});

/** "19/11". */
export function formatClaimDate(date: Date): string {
  return dayMonth.format(date);
}

/** Mercado Livre's reason families (`reason_id` prefix, "Gerenciar reclamações"). */
const REASON_PREFIXES: readonly (readonly [string, string])[] = [
  ["PNR", "O produto não chegou"],
  ["PDD", "O produto chegou diferente ou com defeito"],
  ["CS", "Compra cancelada"],
];

export function claimReason(reasonId: string | null): string | null {
  if (reasonId === null) {
    return null;
  }
  const family = REASON_PREFIXES.find(([prefix]) => reasonId.startsWith(prefix));
  return family?.[1] ?? null;
}

const CLAIM_TITLES: Readonly<Record<string, string>> = {
  return: "Devolução pedida pelo comprador",
  returns: "Devolução pedida pelo comprador",
  change: "Troca pedida pelo comprador",
  cancel_purchase: "Cancelamento pedido pelo comprador",
  cancel_sale: "Venda cancelada pelo vendedor",
};

export function claimTitle(type: string): string {
  return CLAIM_TITLES[type] ?? "Reclamação do comprador";
}

export interface ClaimBadge {
  tone: StatusTone;
  label: string;
}

/** The situation in color, word and date: open, under mediation, or closed. */
export function claimBadge(claim: ClaimView): ClaimBadge {
  if (claim.status === "closed") {
    const closedAt = claim.closedAt ?? claim.openedAt;
    return { tone: "muted", label: `Encerrada em ${formatClaimDate(closedAt)}` };
  }
  if (claim.stage === "dispute") {
    return { tone: "warning", label: "Em mediação do Mercado Livre" };
  }
  return { tone: "danger", label: `Aberta em ${formatClaimDate(claim.openedAt)}` };
}

function until(dueAt: Date | null): string {
  return dueAt === null ? "" : ` até ${formatClaimDate(dueAt)}`;
}

/** Who must act now, and until when, in the reader's words. Null once the claim closed. */
export function claimNextStep(claim: ClaimView, reader: ClaimReader): string | null {
  if (claim.status === "closed") {
    return null;
  }
  if (reader === "supplier") {
    return "O revendedor responde ao comprador pelo Mercado Livre.";
  }
  if (claim.actionResponsible === "seller") {
    return `Responda no Mercado Livre${until(claim.actionDueAt)}. Sem resposta, a venda pode ser perdida.`;
  }
  if (claim.actionResponsible === "buyer") {
    return `Aguardando o comprador${until(claim.actionDueAt)}. Nada a fazer agora.`;
  }
  if (claim.actionResponsible === "mediator") {
    return `O Mercado Livre está analisando${until(claim.actionDueAt)}. Acompanhe por lá.`;
  }
  return "Acompanhe a reclamação no Mercado Livre.";
}

/** Mercado Livre's `resolution.reason` values, in plain words ("Gerenciar reclamações"). */
const RESOLUTIONS: Readonly<Record<string, string>> = {
  payment_refunded: "O dinheiro foi devolvido ao comprador.",
  partial_refunded: "Parte do dinheiro foi devolvida ao comprador.",
  reimbursed: "O dinheiro foi devolvido ao comprador.",
  item_returned: "O produto foi devolvido.",
  coverage_decision: "O Mercado Livre cobriu o valor.",
  worked_out_with_seller: "O comprador resolveu com o vendedor.",
  seller_sent_product: "O vendedor enviou o produto.",
  already_shipped: "O produto já estava a caminho.",
  product_delivered: "O produto foi entregue.",
  opened_claim_by_mistake: "O comprador abriu a reclamação por engano.",
  prefered_to_keep_product: "O comprador preferiu ficar com o produto.",
  found_missing_parts: "O comprador achou as peças que faltavam.",
  return_canceled: "O comprador desistiu da devolução.",
  return_expired: "A devolução venceu sem ser enviada.",
  respondent_timeout: "Encerrada porque o vendedor não respondeu a tempo.",
  timeout: "Encerrada porque o comprador não respondeu a tempo.",
  item_changed: "A troca foi feita.",
};

export function claimResolution(claim: ClaimView): string | null {
  if (claim.status !== "closed") {
    return null;
  }
  if (claim.resolutionReason === null) {
    return "Encerrada pelo Mercado Livre.";
  }
  return RESOLUTIONS[claim.resolutionReason] ?? "Encerrada pelo Mercado Livre.";
}

/** Mercado Livre's return statuses ("Gerenciar devoluções"), in plain words. */
const RETURN_STATUSES: Readonly<Record<string, string>> = {
  pending: "Devolução criada",
  label_generated: "Etiqueta de devolução pronta",
  scheduled: "Retirada da devolução agendada",
  shipped: "Devolução a caminho",
  pending_delivered: "Devolução chegando",
  delivered: "Devolução entregue",
  not_delivered: "Devolução não entregue",
  return_to_buyer: "Devolução voltando ao comprador",
  cancelled: "Devolução cancelada",
  pending_cancel: "Devolução sendo cancelada",
  expired: "Devolução vencida",
  pending_expiration: "Devolução vencendo",
  failed: "A devolução não pôde ser criada",
  pending_failure: "A devolução não pôde ser criada",
};

const MONEY_LINES: Readonly<Record<NonNullable<ClaimView["moneyStatus"]>, string>> = {
  retained: "O dinheiro da venda fica retido até a devolução terminar.",
  refunded: "O dinheiro foi devolvido ao comprador.",
  available: "O dinheiro da venda foi liberado.",
};

function returnDestination(claim: ClaimView, reader: ClaimReader): string {
  if (claim.returnDestination === "marketplace") {
    return " para o depósito do Mercado Livre";
  }
  if (claim.returnDestination === "seller") {
    return reader === "reseller" ? " para o seu endereço" : " para o endereço do revendedor";
  }
  return "";
}

/** The return's situation and destination, its tracking and, for the reseller, the money. */
export function claimReturnLines(claim: ClaimView, reader: ClaimReader): string[] {
  if (claim.returnStatus === null) {
    return [];
  }
  const status = RETURN_STATUSES[claim.returnStatus] ?? "Devolução em andamento";
  const lines = [`${status}${returnDestination(claim, reader)}.`];
  if (claim.returnTrackingCode !== null) {
    lines.push(`Rastreio da devolução: ${claim.returnTrackingCode}`);
  }
  if (reader === "reseller" && claim.moneyStatus !== null) {
    lines.push(MONEY_LINES[claim.moneyStatus]);
  }
  return lines;
}

/** Open claims first, then the most recent. */
export function sortClaims(claims: readonly ClaimView[]): ClaimView[] {
  return claims.toSorted((first, second) => {
    if (first.status !== second.status) {
      return first.status === "opened" ? -1 : 1;
    }
    return second.openedAt.getTime() - first.openedAt.getTime();
  });
}
