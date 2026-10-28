import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments, storeConnections } from "../schema/index.ts";

/**
 * What the "Desempenho" page shows of each order behind a metric: the supplier's parcel with its
 * items and the store it sold on. Like the orders list, no buyer, address or price data.
 */
export interface SupplierOrderParcel {
  orderId: string;
  shipmentId: string;
  status: FulfillmentStatus;
  marketplace: string;
  items: { title: string; sku: string; quantity: number }[];
}

/**
 * The supplier's parcels of each order among `orderIds`, keyed by order. An order split between
 * suppliers only brings this supplier's parcel; one with two parcels of it keeps the first one.
 */
export async function listSupplierOrderParcels(
  database: Database,
  input: { supplierId: string; orderIds: readonly string[] },
): Promise<ReadonlyMap<string, SupplierOrderParcel>> {
  const orderIds = [...new Set(input.orderIds)];
  if (orderIds.length === 0) {
    return new Map();
  }
  const rows = await database
    .select({
      orderId: orderShipments.orderId,
      shipmentId: orderShipments.id,
      status: orderShipments.status,
      marketplace: storeConnections.marketplace,
      items: orderShipments.items,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .where(
      and(
        eq(orderShipments.supplierId, input.supplierId),
        inArray(orderShipments.orderId, orderIds),
      ),
    )
    .orderBy(asc(orderShipments.createdAt), asc(orderShipments.id));
  const firstPerOrder = rows.filter(
    (row, index) => rows.findIndex((other) => other.orderId === row.orderId) === index,
  );
  return new Map(
    firstPerOrder.map((row) => [
      row.orderId,
      {
        ...row,
        items: row.items.map(({ title, sku, quantity }) => ({ title, sku, quantity })),
      },
    ]),
  );
}
