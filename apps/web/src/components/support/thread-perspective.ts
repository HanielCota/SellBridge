import type { TicketEventView } from "@sellbridge/database/repositories";
import { describeCustomerEvent } from "@/components/support/ticket-event-text";

/**
 * How a thread reads for whoever has it open. `isAdmin` messages come from the answering side:
 * the SellBridge team on a ticket, the supplier on a reseller ↔ supplier conversation.
 */
export interface ThreadPerspective {
  /** Whose messages sit on the right, tinted: the asker's, the answerer's, or nobody's. */
  readerSide: "customer" | "responder" | "observer";
  /** Added after the answering side's names ("Ana · Suporte"); null when the name says it. */
  responderTag: string | null;
  /** The team keeps its headset; a supplier is drawn with its initials, like a person. */
  responderAvatar: "headset" | "initials";
  /** One line of history between the messages, or null to leave the change out. */
  describeEvent: (event: TicketEventView) => string | null;
  /** Under the asker's last message: who has or has not opened the thread since. */
  receiptOwner: string;
}

/** The customer reading a website ticket. */
export const CUSTOMER_PERSPECTIVE: ThreadPerspective = {
  readerSide: "customer",
  responderTag: "Suporte",
  responderAvatar: "headset",
  describeEvent: describeCustomerEvent,
  receiptOwner: "pelo suporte",
};

/** The team answering a website ticket: the headset already tells the sides apart. */
export const STAFF_PERSPECTIVE: ThreadPerspective = {
  ...CUSTOMER_PERSPECTIVE,
  readerSide: "responder",
  responderTag: null,
};
