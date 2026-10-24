import type { TicketEventView } from "@sellbridge/database/repositories";
import type { ThreadPerspective } from "@/components/support/thread-perspective";

/** The history of a conversation: only the status changes, told without a person's name. */
export function describeConversationEvent(event: TicketEventView): string | null {
  if (event.type !== "status_changed") {
    return null;
  }
  if (event.automatic) {
    return "Conversa encerrada automaticamente por falta de retorno";
  }
  if (event.toValue === "closed") {
    return "Conversa marcada como resolvida";
  }
  if (event.fromValue === "closed") {
    return "Conversa reaberta";
  }
  return null;
}

const CONVERSATION_BASE = {
  responderTag: null,
  responderAvatar: "initials",
  describeEvent: describeConversationEvent,
  receiptOwner: "pelo fornecedor",
} as const satisfies Omit<ThreadPerspective, "readerSide">;

/** The store reading its conversation: its own messages on the right. */
export const RESELLER_CONVERSATION: ThreadPerspective = {
  ...CONVERSATION_BASE,
  readerSide: "customer",
};

/** The supplier answering: its replies on the right, the store's name on the left. */
export const SUPPLIER_CONVERSATION: ThreadPerspective = {
  ...CONVERSATION_BASE,
  readerSide: "responder",
};

/** The team reading along: nobody's side is its own. */
export const TEAM_CONVERSATION: ThreadPerspective = {
  ...CONVERSATION_BASE,
  readerSide: "observer",
};
