import { and, eq, ne } from "drizzle-orm";
import { orders, orderShipments } from "../schema/index.ts";
import type { DatabaseExecutor } from "../client.ts";
import { recordApiEvent } from "./api-events.ts";
import { syncMarketplaceRefund } from "./marketplace-refunds.ts";
import { applyStockMoves } from "./stock-reservations.ts";

type OrderStatus = (typeof orders.$inferSelect)["status"];
/** Marketplace payment updates must not erase confirmed physical shipment progress. */
export async function reconciledOrderStatus(
  database: DatabaseExecutor,
  orderId: string,
  incoming: OrderStatus,
): Promise<OrderStatus> {
  if (incoming !== "paid") return incoming;
  // A cancelled parcel is waiting to be re-forwarded or dropped: it neither ships nor holds back.
  const shipments = await database
    .select({ status: orderShipments.status })
    .from(orderShipments)
    .where(and(eq(orderShipments.orderId, orderId), ne(orderShipments.status, "cancelled")));
  if (shipments.length === 0) return incoming;
  // Every parcel came back without reaching the buyer: nothing was sold.
  if (shipments.every((shipment) => shipment.status === "returned")) return "returned";
  if (shipments.every((shipment) => shipment.status === "delivered")) return "delivered";
  if (shipments.every((shipment) => ["shipped", "delivered"].includes(shipment.status)))
    return "shipped";
  return incoming;
}
/**
 * Moves the order along with its parcels: shipped, delivered, or returned when every parcel came
 * back or `buyerReturned` (the buyer's return parcel reached the seller after delivery).
 */
export async function syncOrderFromShipments(
  database: DatabaseExecutor,
  order: typeof orders.$inferSelect,
  options: { buyerReturned?: boolean } = {},
) {
  if (!["paid", "shipped", "delivered"].includes(order.status)) return;
  const status = options.buyerReturned
    ? "returned"
    : await reconciledOrderStatus(database, order.id, "paid");
  if (status === "paid" || status === order.status) return;
  await database
    .update(orders)
    .set({
      status,
      deliveredAt: status === "delivered" ? (order.deliveredAt ?? new Date()) : order.deliveredAt,
    })
    .where(and(eq(orders.id, order.id), eq(orders.tenantId, order.tenantId)));
  // Shipped by the supplier: the held units leave the shelf now, not at the next marketplace sync.
  await applyStockMoves(database, order.id, status);
  // A returned order has no revenue: money already given back now shows as a return.
  await syncMarketplaceRefund(database, { tenantId: order.tenantId, orderId: order.id, status });
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
