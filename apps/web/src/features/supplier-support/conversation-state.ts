import type { ConversationSide } from "@sellbridge/shared/supplier-conversation-topics";
import { AUTO_CLOSE_AFTER_DAYS, type TicketStatus } from "@sellbridge/shared/ticket-rules";

export type ConversationTone = "waiting" | "answered" | "closed";

export interface ConversationState {
  tone: ConversationTone;
  headline: string;
  detail: string;
}

const RESELLER_STATES: Record<TicketStatus, ConversationState> = {
  open: {
    tone: "waiting",
    headline: "Aguardando o fornecedor",
    detail: "Avisamos você quando ele responder.",
  },
  answered: {
    tone: "answered",
    headline: "O fornecedor respondeu",
    detail: `Se ainda precisar de algo, responda abaixo. Sem retorno em ${AUTO_CLOSE_AFTER_DAYS} dias, a conversa encerra sozinha.`,
  },
  closed: {
    tone: "closed",
    headline: "Conversa resolvida",
    detail: "Se precisar de novo, é só escrever abaixo.",
  },
};

const SUPPLIER_STATES: Record<TicketStatus, ConversationState> = {
  open: {
    tone: "waiting",
    headline: "Aguardando sua resposta",
    detail: "A loja recebe um aviso quando você responder.",
  },
  answered: {
    tone: "answered",
    headline: "Você respondeu",
    detail: `Sem retorno da loja em ${AUTO_CLOSE_AFTER_DAYS} dias, a conversa encerra sozinha.`,
  },
  closed: {
    tone: "closed",
    headline: "Conversa resolvida",
    detail: "Se a loja escrever de novo, a conversa volta para você.",
  },
};

/** Where the conversation is and what happens next, in the reader's words. */
export function conversationState(side: ConversationSide, status: TicketStatus): ConversationState {
  return side === "reseller" ? RESELLER_STATES[status] : SUPPLIER_STATES[status];
}

/** A supplier cannot reopen a resolved conversation: only the store's next message does. */
export function canWrite(side: ConversationSide, status: TicketStatus): boolean {
  return side === "reseller" || status !== "closed";
}
