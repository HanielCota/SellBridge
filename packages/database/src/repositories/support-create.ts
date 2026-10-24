import { conflictError } from "@sellbridge/shared/errors";
import type { SupplierConversationTopicId } from "@sellbridge/shared/supplier-conversation-topics";
import type { TicketCategory, TicketPriority } from "@sellbridge/shared/ticket-rules";
import type { Database, Transaction } from "../client.ts";
import { ticketMessages, tickets } from "../schema/index.ts";
import { insertAttachments, type NewAttachment } from "./support.ts";

/** The store a supplier conversation is about, its supplier and the reseller's topic. */
export interface SupplierConversationTarget {
  supplierId: string;
  storeConnectionId: string;
  topic: SupplierConversationTopicId;
}

function conversationColumns(target: SupplierConversationTarget | undefined) {
  if (target === undefined) {
    return {};
  }
  return {
    audience: "supplier" as const,
    supplierId: target.supplierId,
    storeConnectionId: target.storeConnectionId,
    supplierTopic: target.topic,
  };
}

/** The answer was read before the ticket existed: it sorts right before the first message. */
const ASSISTANT_NOTE_LEAD_MILLISECONDS = 1;

/**
 * The assistant's answer, kept for the team only. Written on the customer's behalf (`isAdmin`
 * false) and hidden from them (`isInternal` true): the pair `isAssistantMessage` looks for.
 * It never counts as a reply, so response times and unread dots stay as they were.
 */
async function insertAssistantNote(
  transaction: Transaction,
  note: { ticketId: string; userId: string; body: string; shownAt: Date },
): Promise<void> {
  await transaction.insert(ticketMessages).values({
    ticketId: note.ticketId,
    authorId: note.userId,
    isAdmin: false,
    isInternal: true,
    body: note.body,
    createdAt: note.shownAt,
  });
}

/**
 * Opens a ticket with its first message and files. The priority comes from what the customer
 * said is going on (the support topics), never from a field the customer fills in.
 */
export async function createTicket(
  database: Database,
  input: {
    tenantId: string;
    userId: string;
    category: TicketCategory;
    priority?: TicketPriority;
    subject: string;
    body: string;
    attachments: readonly NewAttachment[];
    /** What the support assistant answered before the customer asked for a person. */
    assistantNote?: string | undefined;
    /** Sent to the supplier of a store instead of the team (a supplier conversation). */
    conversation?: SupplierConversationTarget | undefined;
    now?: Date;
  },
): Promise<{ ticketId: string }> {
  const now = input.now ?? new Date();
  return database.transaction(async (transaction) => {
    const [ticket] = await transaction
      .insert(tickets)
      .values({
        tenantId: input.tenantId,
        createdById: input.userId,
        category: input.category,
        priority: input.priority ?? "normal",
        subject: input.subject,
        ...conversationColumns(input.conversation),
        awaitingSince: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: tickets.id });
    if (!ticket) {
      throw conflictError("Não foi possível abrir o chamado");
    }
    const [message] = await transaction
      .insert(ticketMessages)
      .values({
        ticketId: ticket.id,
        authorId: input.userId,
        isAdmin: false,
        body: input.body,
        createdAt: now,
      })
      .returning({ id: ticketMessages.id });
    if (!message) {
      throw conflictError("Não foi possível registrar a mensagem");
    }
    await insertAttachments(transaction, ticket.id, message.id, input.attachments);
    if (input.assistantNote !== undefined) {
      await insertAssistantNote(transaction, {
        ticketId: ticket.id,
        userId: input.userId,
        body: input.assistantNote,
        shownAt: new Date(now.getTime() - ASSISTANT_NOTE_LEAD_MILLISECONDS),
      });
    }
    return { ticketId: ticket.id };
  });
}
