import type { StatementSituation } from "@sellbridge/shared/supplier-statement";
import type { PaymentBadgeTone } from "@/components/supplier-payments/supplier-payment-badge";
import { formatShortDate } from "@/lib/relative-time";

/** The situation pill: the same words the parcel window uses for money ("Devolução em andamento"). */
export function statementSituationPill(situation: StatementSituation): {
  tone: PaymentBadgeTone;
  text: string;
} {
  if (situation.kind === "waiting_delivery") {
    return { tone: "neutral", text: "Libera depois da entrega" };
  }
  if (situation.kind === "releases_on") {
    return { tone: "neutral", text: `Libera em ${formatShortDate(situation.on)}` };
  }
  if (situation.kind === "released") {
    const text =
      situation.on === null ? "Liberado" : `Liberado em ${formatShortDate(situation.on)}`;
    return { tone: "success", text };
  }
  if (situation.kind === "team_review") {
    return { tone: "warning", text: "Em análise pela equipe" };
  }
  if (situation.kind === "returning") {
    return { tone: "warning", text: "Devolução em andamento" };
  }
  if (situation.kind === "returned") {
    const text =
      situation.on === null
        ? "Devolvido ao revendedor"
        : `Devolvido ao revendedor em ${formatShortDate(situation.on)}`;
    return { tone: "neutral", text };
  }
  return { tone: "danger", text: "Contestado no cartão" };
}

/** "Camiseta (2)", "Camiseta (2) e mais 1 produto": what the supplier recognizes in a parcel. */
export function statementItemsLabel(items: readonly { title: string; quantity: number }[]): string {
  const [first, ...others] = items;
  if (first === undefined) {
    return "Produtos do pedido";
  }
  const firstLabel = first.quantity > 1 ? `${first.title} (${first.quantity})` : first.title;
  if (others.length === 0) {
    return firstLabel;
  }
  const more = others.length === 1 ? "mais 1 produto" : `mais ${others.length} produtos`;
  return `${firstLabel} e ${more}`;
}
