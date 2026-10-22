import { SHIPMENT_ACTORS } from "@sellbridge/shared/schemas";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments, shipmentEvents, suppliers } from "../schema/index.ts";
import type { NotificationReader } from "./notifications.ts";
import { listUnreadSupportReplies } from "./support.ts";

/*
 * Bell entries for someone answering the reseller: the support team on a ticket, or a supplier in
 * an order's messages. Kept apart from `notifications.ts`, which is at its size limit.
 */

export interface SupportReplyEvent {
  kind: "support_reply";
  /** The ticket. */
  entityId: string;
  at: Date;
  subject: string;
}

export interface OrderMessageEvent {
  kind: "order_message";
  /** The order, so the entry opens its page; one entry per order, its latest message. */
  entityId: string;
  at: Date;
  externalOrderId: string;
  supplierName: string;
}

export async function supportReplyEvents(
  database: Database,
  reader: NotificationReader,
  limit: number,
): Promise<SupportReplyEvent[]> {
  const rows = await listUnreadSupportReplies(database, reader.tenantId, reader.userId, limit);
  return rows.map((row) => ({
    kind: "support_reply" as const,
    entityId: row.ticketId,
    subject: row.subject,
    at: row.repliedAt,
  }));
}

/**
 * Supplier messages of the store's parcels since `since`: a supplier note that keeps the status
 * of the event before it (`order-messages.ts` in the web app reads events the same way).
 */
export async function orderMessageEvents(
  database: Database,
  input: { tenantId: string; since: Date; limit: number },
): Promise<OrderMessageEvent[]> {
  const ranked = database
    .select({
      at: shipmentEvents.createdAt,
      actor: shipmentEvents.actor,
      note: shipmentEvents.note,
      status: shipmentEvents.status,
      previousStatus: sql<
        string | null
      >`lag(${shipmentEvents.status}) over (partition by ${shipmentEvents.shipmentId} order by ${shipmentEvents.createdAt}, ${shipmentEvents.id})`.as(
        "previous_status",
      ),
      orderId: orderShipments.orderId,
      externalOrderId: orders.externalOrderId,
      supplierName: suppliers.name,
    })
    .from(shipmentEvents)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentEvents.shipmentId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(eq(orderShipments.tenantId, input.tenantId))
    .as("ranked");
  const rows = await database
    .select()
    .from(ranked)
    .where(
      and(
        eq(ranked.actor, SHIPMENT_ACTORS.supplier),
        sql`btrim(${ranked.note}) <> ''`,
        sql`${ranked.status} = ${ranked.previousStatus}`,
        gte(ranked.at, input.since),
      ),
    )
    .orderBy(desc(ranked.at))
    .limit(input.limit * 5);
  const latestPerOrder = new Map<string, OrderMessageEvent>();
  for (const row of rows) {
    if (latestPerOrder.has(row.orderId)) {
      continue;
    }
    latestPerOrder.set(row.orderId, {
      kind: "order_message",
      entityId: row.orderId,
      at: row.at,
      externalOrderId: row.externalOrderId,
      supplierName: row.supplierName,
    });
  }
  return [...latestPerOrder.values()].slice(0, input.limit);
}
