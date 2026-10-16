import type { TicketEventView } from "@sellbridge/database/repositories";
import { TICKET_CATEGORY_LABELS } from "@sellbridge/shared/schemas";
import { MAX_RATING } from "@sellbridge/shared/ticket-rules";

const CATEGORY_LABELS: Readonly<Record<string, string>> = TICKET_CATEGORY_LABELS;

function categoryLabel(value: string | null): string {
  if (value === null) {
    return "—";
  }
  return CATEGORY_LABELS[value] ?? value;
}

function statusLine(event: TicketEventView, actor: string): string | null {
  if (event.automatic) {
    return "Chamado encerrado automaticamente por falta de retorno";
  }
  if (event.toValue === "closed") {
    return `${actor} encerrou o chamado`;
  }
  if (event.fromValue === "closed") {
    return "Chamado reaberto";
  }
  // Open ⇄ answered follows every message; the messages themselves already say it.
  return null;
}

/**
 * One line of history between the messages, as the reseller reads it. Null for changes that
 * only repeat what the conversation already shows.
 */
export function describeCustomerEvent(event: TicketEventView): string | null {
  const actor = event.actorName ?? "Usuário removido";
  if (event.type === "status_changed") {
    return statusLine(event, actor);
  }
  if (event.type === "assigned") {
    return event.toValue === null ? null : `${event.toValue} está cuidando do seu chamado`;
  }
  if (event.type === "category_changed") {
    return `Tema alterado para ${categoryLabel(event.toValue)}`;
  }
  if (event.type === "rated") {
    return `Atendimento avaliado com ${event.toValue ?? "?"} de ${MAX_RATING}`;
  }
  if (event.type === "order_linked") {
    return `${actor} vinculou o pedido #${event.toValue ?? ""}`;
  }
  if (event.type === "order_unlinked") {
    return `${actor} desvinculou o pedido #${event.fromValue ?? ""}`;
  }
  if (event.type === "follower_added") {
    return `${actor} adicionou ${event.toValue ?? "um colega"} ao chamado`;
  }
  return null;
}
