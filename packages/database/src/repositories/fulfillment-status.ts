import { and, eq } from "drizzle-orm";
import { orders, orderShipments } from "../schema/index.ts";
import type { DatabaseExecutor } from "../client.ts";
import { recordApiEvent } from "./api-events.ts";

type OrderStatus = (typeof orders.$inferSelect)["status"];
/** Marketplace payment updates must not erase confirmed physical shipment progress. */
export async function reconciledOrderStatus(
  database: DatabaseExecutor,
  orderId: string,
  incoming: OrderStatus,
): Promise<OrderStatus> {
  if (incoming !== "paid") return incoming;
  const shipments = await database
    .select({ status: orderShipments.status })
    .from(orderShipments)
    .where(eq(orderShipments.orderId, orderId));
  if (shipments.length === 0) return incoming;
  if (shipments.every((shipment) => shipment.status === "delivered")) return "delivered";
  if (shipments.every((shipment) => ["shipped", "delivered"].includes(shipment.status)))
    return "shipped";
  return incoming;
}
export async function syncOrderFromShipments(
  database: DatabaseExecutor,
  order: typeof orders.$inferSelect,
) {
  if (!["paid", "shipped"].includes(order.status)) return;
  const status = await reconciledOrderStatus(database, order.id, "paid");
  if (status === "paid" || status === order.status) return;
  await database
    .update(orders)
    .set({
      status,
      deliveredAt: status === "delivered" ? (order.deliveredAt ?? new Date()) : order.deliveredAt,
    })
    .where(and(eq(orders.id, order.id), eq(orders.tenantId, order.tenantId)));
  await recordApiEvent(database, {
    tenantId: order.tenantId,
    type: "order.status_changed",
    data: {
      orderId: order.id,
      externalOrderId: order.externalOrderId,
      storeId: order.storeConnectionId,
      status,
      previousStatus: order.status,
      totalCents: order.totalCents,
      orderedAt: order.orderedAt.toISOString(),
    },
  });
}
