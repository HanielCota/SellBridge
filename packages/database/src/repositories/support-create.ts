import { conflictError } from "@sellbridge/shared/errors";
import type { TicketCategory, TicketPriority } from "@sellbridge/shared/ticket-rules";
import type { Database } from "../client.ts";
import { ticketMessages, tickets } from "../schema/index.ts";
import { insertAttachments, type NewAttachment } from "./support.ts";

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
    return { ticketId: ticket.id };
  });
}
