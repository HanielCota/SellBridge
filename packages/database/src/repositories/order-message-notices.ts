import { orderMessageContent } from "@sellbridge/shared/notification-events";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments, suppliers } from "../schema/index.ts";
import { notifyWorkspace } from "./notification-producers.ts";

/** What a "new message" notice needs about a parcel, on either side. */
export interface OrderMessageContext {
  tenantId: string;
  orderId: string;
  externalOrderId: string;
  /** When the parcel was forwarded: the day the supplier got its link by e-mail. */
  forwardedAt: Date;
  /** The supplier's order e-mail; null when none was registered. */
  supplierEmail: string | null;
  /** A supplier with its own panel reads messages there; the others only by the link. */
  supplierHasAccount: boolean;
}

export async function findOrderMessageContext(
  database: Database,
  shipmentId: string,
): Promise<OrderMessageContext | null> {
  const [row] = await database
    .select({
      tenantId: orderShipments.tenantId,
      orderId: orderShipments.orderId,
      externalOrderId: orders.externalOrderId,
      forwardedAt: orderShipments.createdAt,
      supplierEmail: suppliers.contactEmail,
      supplierOrganizationId: suppliers.organizationId,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(eq(orderShipments.id, shipmentId));
  if (row === undefined) {
    return null;
  }
  const { supplierOrganizationId, ...context } = row;
  return { ...context, supplierHasAccount: supplierOrganizationId !== null };
}

/**
 * The store's people learn the supplier wrote (bell and e-mail, by each one's choice). The text
 * is not in the notice. `messageKey` names the message, so a retry never queues it twice.
 */
export async function queueOrderMessageNotices(
  database: Database,
  input: { context: OrderMessageContext; messageKey: string },
): Promise<number> {
  const { context } = input;
  return notifyWorkspace(database, {
    tenantId: context.tenantId,
    event: "order_message",
    dedupeKey: `order_message:${input.messageKey}`,
    content: orderMessageContent({
      orderId: context.orderId,
      externalOrderId: context.externalOrderId,
    }),
  });
}
