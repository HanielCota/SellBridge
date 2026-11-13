import { notFoundError } from "@sellbridge/shared/errors";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  orderShipments,
  orders,
  ticketAttachments,
  ticketEvents,
  ticketMessages,
  ticketOrders,
  tickets,
} from "../schema/index.ts";
import { supplierConversationSql } from "./support-audience.ts";

/*
 * What the supplier's queue shows next to each conversation (the order it is about and the
 * store's latest file) and the supplier's "Finalizar". Reads take the page's ticket ids, so a
 * page costs two queries whatever its size.
 */

export interface ConversationSummaryOrder {
  orderId: string;
  externalOrderId: string;
  /** Where the conversation's supplier has the parcel; null when it has none for this order. */
  shipmentStatus: FulfillmentStatus | null;
}

/** The first order pinned to each conversation, with the supplier's parcel of it. */
export async function listFirstPinnedOrders(
  database: Database,
  ticketIds: readonly string[],
): Promise<Map<string, ConversationSummaryOrder>> {
  if (ticketIds.length === 0) {
    return new Map();
  }
  const rows = await database
    .selectDistinctOn([ticketOrders.ticketId], {
      ticketId: ticketOrders.ticketId,
      orderId: orders.id,
      externalOrderId: orders.externalOrderId,
      shipmentStatus: orderShipments.status,
    })
    .from(ticketOrders)
    .innerJoin(tickets, eq(tickets.id, ticketOrders.ticketId))
    .innerJoin(orders, eq(orders.id, ticketOrders.orderId))
    .leftJoin(
      orderShipments,
      and(eq(orderShipments.orderId, orders.id), eq(orderShipments.supplierId, tickets.supplierId)),
    )
    .where(inArray(ticketOrders.ticketId, [...ticketIds]))
    .orderBy(ticketOrders.ticketId, asc(ticketOrders.createdAt));
  return new Map(rows.map(({ ticketId, ...order }) => [ticketId, order]));
}

/** The latest file the store sent on each conversation: the supplier's "Ver comprovante". */
export async function listLatestStoreAttachments(
  database: Database,
  ticketIds: readonly string[],
): Promise<Map<string, string>> {
  if (ticketIds.length === 0) {
    return new Map();
  }
  const rows = await database
    .selectDistinctOn([ticketAttachments.ticketId], {
      ticketId: ticketAttachments.ticketId,
      attachmentId: ticketAttachments.id,
    })
    .from(ticketAttachments)
    .innerJoin(ticketMessages, eq(ticketMessages.id, ticketAttachments.messageId))
    .where(
      and(
        inArray(ticketAttachments.ticketId, [...ticketIds]),
        eq(ticketMessages.isAdmin, false),
        eq(ticketMessages.isInternal, false),
      ),
    )
    .orderBy(ticketAttachments.ticketId, desc(ticketAttachments.createdAt));
  return new Map(rows.map((row) => [row.ticketId, row.attachmentId]));
}

/**
 * "Finalizar": the supplier closes a conversation sent to its brand. The store's next message
 * opens it again, so nothing is lost; finishing one already closed changes nothing.
 *
 * @throws {AppError} NOT_FOUND when the conversation is not this supplier's.
 */
export async function closeConversationForSupplier(
  database: Database,
  input: { ticketId: string; supplierId: string; userId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const [ticket] = await transaction
      .select({ id: tickets.id, status: tickets.status })
      .from(tickets)
      .where(
        and(
          eq(tickets.id, input.ticketId),
          supplierConversationSql,
          eq(tickets.supplierId, input.supplierId),
        ),
      )
      .limit(1)
      .for("update");
    if (ticket === undefined) {
      throw notFoundError("Conversa não encontrada");
    }
    if (ticket.status === "closed") {
      return;
    }
    await transaction
      .update(tickets)
      .set({
        status: "closed",
        awaitingSince: null,
        responseDueAt: null,
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(tickets.id, ticket.id));
    await transaction.insert(ticketEvents).values({
      ticketId: ticket.id,
      actorId: input.userId,
      type: "status_changed",
      fromValue: ticket.status,
      toValue: "closed",
      createdAt: now,
    });
  });
}
