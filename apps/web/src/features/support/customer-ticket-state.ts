import type { TicketPriority, TicketStatus } from "@sellbridge/shared/schemas";
import {
  AUTO_CLOSE_AFTER_DAYS,
  autoCloseAt,
  responseTiming,
} from "@sellbridge/shared/ticket-rules";
import { RESPONSE_PROMISE } from "@/features/support/response-time";

const TIME_ZONE = "America/Sao_Paulo";
const dayAndMonth = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: TIME_ZONE,
});

/** One word per status, the same on every customer screen (list, ticket, badges). */
export const CUSTOMER_TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Esperando o suporte",
  answered: "O suporte respondeu",
  closed: "Encerrado",
};

export type CustomerTicketTone = "waiting" | "late" | "answered" | "closed";

export interface CustomerTicketState {
  tone: CustomerTicketTone;
  headline: string;
  detail: string;
}

export interface CustomerTicketFacts {
  status: TicketStatus;
  priority: TicketPriority;
  awaitingSince: Date | null;
  updatedAt: Date;
  /** The last close came from the idle job, not from a person. */
  closedAutomatically: boolean;
  /** The viewer gets the answers by e-mail; otherwise the line never promises it. */
  emailsOn: boolean;
}

function waitingState(facts: CustomerTicketFacts, now: Date): CustomerTicketState {
  const timing = responseTiming(facts.awaitingSince, facts.priority, now);
  const headline = CUSTOMER_TICKET_STATUS_LABELS.open;
  // The team's target is in calendar hours, so the page never shows an hour that may pass at
  // night; once it has passed, the page says so instead of showing a date in the past.
  if (timing.state === "overdue") {
    return {
      tone: "late",
      headline,
      detail: "Está demorando mais que o normal. Seu chamado continua na fila.",
    };
  }
  const byEmail = facts.emailsOn ? " A resposta chega aqui e por e-mail." : "";
  return { tone: "waiting", headline, detail: `${RESPONSE_PROMISE}.${byEmail}` };
}

function answeredState(facts: CustomerTicketFacts): CustomerTicketState {
  const closesAt = autoCloseAt(facts.status, facts.awaitingSince, facts.updatedAt);
  const warning =
    closesAt === null ? "" : ` Sem resposta até ${dayAndMonth.format(closesAt)}, encerramos.`;
  return {
    tone: "answered",
    headline: CUSTOMER_TICKET_STATUS_LABELS.answered,
    detail: `Leia a resposta e diga se resolveu.${warning}`,
  };
}

function closedState(facts: CustomerTicketFacts): CustomerTicketState {
  if (facts.closedAutomatically) {
    return {
      tone: "closed",
      headline: "Encerrado por falta de resposta",
      detail: `Ficou ${AUTO_CLOSE_AFTER_DAYS} dias sem resposta sua. Escreva abaixo para reabrir.`,
    };
  }
  return {
    tone: "closed",
    headline: CUSTOMER_TICKET_STATUS_LABELS.closed,
    detail: "Precisa de mais alguma coisa? Escreva abaixo e o chamado reabre.",
  };
}

/**
 * The single line under the ticket title: where the ticket is and what the customer does next,
 * for every situation the three stored statuses hide (late answer, closing soon, closed by the
 * idle job).
 */
export function customerTicketState(facts: CustomerTicketFacts, now: Date): CustomerTicketState {
  if (facts.status === "open") {
    return waitingState(facts, now);
  }
  if (facts.status === "answered") {
    return answeredState(facts);
  }
  return closedState(facts);
}
