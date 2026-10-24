import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import { storeConnections, suppliers, tickets } from "../schema/index.ts";
import type { NotificationReader } from "./notifications.ts";
import { supplierConversationSql } from "./support-audience.ts";
import { hasUnreadSql } from "./support-unread.ts";

/** A message in a reseller ↔ supplier conversation the reader has not opened yet. */
export interface SupplierConversationEvent {
  kind: "supplier_conversation";
  /** The conversation (a ticket with the `supplier` audience). */
  entityId: string;
  at: Date;
  subject: string;
  storeName: string | null;
  /** Who wrote: the supplier (read by the store) or the reseller (read by the supplier). */
  from: "supplier" | "reseller";
}

/** The latest message of the other side: supplier messages are `is_admin`, the store's are not. */
function lastMessageAtSql(fromSupplier: boolean): SQL<Date> {
  const side = fromSupplier
    ? sql.raw("conversation_m.is_admin")
    : sql.raw("not conversation_m.is_admin");
  return sql<Date>`(
    select max(conversation_m.created_at) from ticket_messages conversation_m
    where conversation_m.ticket_id = "tickets"."id" and ${side} and not conversation_m.is_internal
  )`.mapWith(tickets.updatedAt);
}

async function unreadOnSide(
  database: Database,
  input: {
    where: SQL | undefined;
    reader: NotificationReader;
    from: "supplier" | "reseller";
    limit: number;
  },
): Promise<SupplierConversationEvent[]> {
  const fromSupplier = input.from === "supplier";
  const at = lastMessageAtSql(fromSupplier);
  const side = fromSupplier ? ("customer" as const) : ("staff" as const);
  const rows = await database
    .select({
      entityId: tickets.id,
      subject: tickets.subject,
      storeName: storeConnections.shopName,
      at,
    })
    .from(tickets)
    .leftJoin(storeConnections, eq(storeConnections.id, tickets.storeConnectionId))
    .where(and(input.where, hasUnreadSql({ userId: input.reader.userId, side })))
    .orderBy(desc(at))
    .limit(input.limit);
  return rows.map((row) => ({ kind: "supplier_conversation" as const, from: input.from, ...row }));
}

/**
 * Bell entries for the conversations between stores and suppliers. A reseller organization reads
 * the supplier's replies; a supplier profile reads what stores wrote to its brand.
 */
export async function supplierConversationEvents(
  database: Database,
  reader: NotificationReader,
  limit: number,
): Promise<SupplierConversationEvent[]> {
  const brandOfProfile = database
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.organizationId, reader.tenantId));
  const [replies, incoming] = await Promise.all([
    unreadOnSide(database, {
      where: and(supplierConversationSql, eq(tickets.tenantId, reader.tenantId)),
      reader,
      from: "supplier",
      limit,
    }),
    unreadOnSide(database, {
      where: and(supplierConversationSql, inArray(tickets.supplierId, brandOfProfile)),
      reader,
      from: "reseller",
      limit,
    }),
  ]);
  return [...replies, ...incoming];
}
