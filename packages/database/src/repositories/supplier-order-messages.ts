import { SHIPMENT_ACTORS } from "@sellbridge/shared/schemas";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments, storeConnections, suppliers } from "../schema/index.ts";
import { supplierTabFor } from "./marketplace-claims.ts";

/*
 * The store's messages on a parcel, as the supplier with a panel reads them: "Mensagem nova" in
 * its orders and bell until it opens the parcel (`supplierMessagesReadAt`). A message is a store
 * note that keeps the status of the event before it, as `orderMessageMoments` reads them.
 */

/** When the latest store message the supplier has not opened was written; null when none. */
const unreadStoreMessageAt = sql<Date | null>`(
  select max(message_e.created_at) from shipment_events message_e
  where message_e.shipment_id = ${orderShipments.id}
    and message_e.actor = ${SHIPMENT_ACTORS.reseller}
    and btrim(message_e.note) <> ''
    and message_e.created_at > coalesce(${orderShipments.supplierMessagesReadAt}, '-infinity'::timestamptz)
    and message_e.status = (
      select previous_e.status from shipment_events previous_e
      where previous_e.shipment_id = message_e.shipment_id
        and (previous_e.created_at, previous_e.id) < (message_e.created_at, message_e.id)
      order by previous_e.created_at desc, previous_e.id desc
      limit 1
    )
)`.mapWith((value: string | Date | null) => (value === null ? null : new Date(value)));

/** For the supplier's order rows: the store wrote since the supplier last opened the parcel. */
export const hasUnreadStoreMessage: SQL<boolean> = sql<boolean>`(${unreadStoreMessageAt} is not null)`;

/** The supplier opened the parcel: its store messages so far stop being new. */
export async function markStoreMessagesRead(
  database: Database,
  input: { supplierId: string; shipmentId: string },
  now: Date = new Date(),
): Promise<void> {
  await database
    .update(orderShipments)
    .set({ supplierMessagesReadAt: now })
    .where(
      and(eq(orderShipments.id, input.shipmentId), eq(orderShipments.supplierId, input.supplierId)),
    );
}

/** A store message the supplier has not opened yet, one bell entry per parcel. */
export interface StoreOrderMessageEvent {
  kind: "order_message";
  from: "reseller";
  /** The parcel. */
  entityId: string;
  at: Date;
  externalOrderId: string;
  storeName: string;
  /** The Pedidos tab that lists the parcel now, so the entry opens where it is. */
  supplierTab: string;
}

/** Bell entries of a supplier profile (`tenantId` is the supplier's organization). */
export async function storeOrderMessageEvents(
  database: Database,
  input: { tenantId: string; limit: number },
): Promise<StoreOrderMessageEvent[]> {
  const brandOfProfile = database
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.organizationId, input.tenantId));
  const rows = await database
    .select({
      entityId: orderShipments.id,
      status: orderShipments.status,
      externalOrderId: orders.externalOrderId,
      storeName: storeConnections.shopName,
      at: unreadStoreMessageAt,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .where(and(inArray(orderShipments.supplierId, brandOfProfile), hasUnreadStoreMessage))
    .orderBy(desc(unreadStoreMessageAt))
    .limit(input.limit);
  return rows.flatMap(({ status, at, ...row }) =>
    at === null
      ? []
      : [
          {
            ...row,
            kind: "order_message" as const,
            from: "reseller" as const,
            at,
            supplierTab: supplierTabFor(status),
          },
        ],
  );
}
