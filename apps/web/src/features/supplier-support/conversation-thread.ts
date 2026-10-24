import type { TicketThread } from "@sellbridge/database/repositories";

/*
 * A conversation as each side reads it. Both sides see the brand and the store, never a person's
 * e-mail, phone or photo from the other side: the supplier reads the store's name on the
 * reseller's messages, the reseller reads the brand's name on the supplier's.
 */

/** The reseller who asked, the supplier who answers, or the SellBridge team reading along. */
export type ConversationReader = "reseller" | "supplier" | "team";

type ThreadMessage = TicketThread["messages"][number];
type ThreadEvent = TicketThread["events"][number];

export interface ConversationHeader {
  id: string;
  subject: string;
  status: TicketThread["ticket"]["status"];
  topic: TicketThread["ticket"]["supplierTopic"];
  storeName: string;
  supplierName: string;
  /** The reseller's account name, as the supplier and the team know them. */
  resellerName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationOrderLink {
  orderId: string;
  externalOrderId: string;
}

export interface ConversationView {
  conversation: ConversationHeader;
  messages: ThreadMessage[];
  events: ThreadEvent[];
  orders: ConversationOrderLink[];
}

const FALLBACK_SUPPLIER = "Fornecedor";
const FALLBACK_STORE = "Loja";

function headerOf(ticket: TicketThread["ticket"]): ConversationHeader {
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    topic: ticket.supplierTopic,
    storeName: ticket.storeName ?? FALLBACK_STORE,
    supplierName: ticket.supplierName ?? FALLBACK_SUPPLIER,
    resellerName: ticket.tenantName,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

/** Whose words the message carries, in the reader's terms. `isAdmin` marks the supplier's side. */
function authorFor(message: ThreadMessage, header: ConversationHeader, reader: ConversationReader) {
  if (message.isAdmin && reader === "team") {
    return { authorName: `${message.authorName} · ${header.supplierName}`, authorImage: null };
  }
  if (message.isAdmin) {
    // The brand answers, whoever on its team typed: the avatar shows its initials.
    return { authorName: header.supplierName, authorImage: null };
  }
  if (reader === "reseller") {
    return { authorName: message.authorName, authorImage: message.authorImage };
  }
  if (reader === "team") {
    return { authorName: `${message.authorName} · ${header.storeName}`, authorImage: null };
  }
  return { authorName: header.storeName, authorImage: null };
}

/**
 * Only what both sides may read: no internal notes (none are written here, but a stray one stays
 * hidden), and from the history only the status changes, told without a person's name.
 */
export function presentConversation(
  thread: TicketThread,
  orders: readonly ConversationOrderLink[],
  reader: ConversationReader,
): ConversationView {
  const header = headerOf(thread.ticket);
  return {
    conversation: header,
    messages: thread.messages
      .filter((message) => !message.isInternal)
      .map((message) => ({ ...message, ...authorFor(message, header, reader) })),
    events: thread.events
      .filter((event) => event.type === "status_changed")
      .map((event) => ({ ...event, actorName: null, isSelfAssignment: false })),
    orders: orders.map(({ orderId, externalOrderId }) => ({ orderId, externalOrderId })),
  };
}
