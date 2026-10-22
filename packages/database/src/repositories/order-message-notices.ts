import { orderMessageContent } from "@sellbridge/shared/notification-events";
import type {
  OrderMessageAuthor,
  OrderMessageMoment,
} from "@sellbridge/shared/order-message-email-throttle";
import { SHIPMENT_ACTORS } from "@sellbridge/shared/schemas";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments, shipmentEvents, suppliers } from "../schema/index.ts";
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

const AUTHOR_BY_ACTOR: Readonly<Record<string, OrderMessageAuthor>> = {
  [SHIPMENT_ACTORS.reseller]: "reseller",
  [SHIPMENT_ACTORS.supplier]: "supplier",
};

/**
 * Every message of the parcel, both sides, oldest first: what `planOrderMessageEmail` replays to
 * keep one e-mail per window. A parcel holds at most 100 events, so this stays small.
 */
export async function orderMessageMoments(
  database: Database,
  shipmentId: string,
): Promise<OrderMessageMoment[]> {
  // A message keeps the status of the event before it; the forward and the steps do not.
  const ranked = database
    .select({
      at: shipmentEvents.createdAt,
      actor: shipmentEvents.actor,
      note: shipmentEvents.note,
      status: shipmentEvents.status,
      previousStatus: sql<
        string | null
      >`lag(${shipmentEvents.status}) over (order by ${shipmentEvents.createdAt}, ${shipmentEvents.id})`.as(
        "previous_status",
      ),
    })
    .from(shipmentEvents)
    .where(eq(shipmentEvents.shipmentId, shipmentId))
    .as("ranked");
  const rows = await database
    .select({ at: ranked.at, actor: ranked.actor })
    .from(ranked)
    .where(and(sql`btrim(${ranked.note}) <> ''`, sql`${ranked.status} = ${ranked.previousStatus}`))
    .orderBy(asc(ranked.at));
  return rows.flatMap((row) => {
    const author = AUTHOR_BY_ACTOR[row.actor];
    return author === undefined ? [] : [{ at: row.at, author }];
  });
}
