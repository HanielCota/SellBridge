import { and, count, eq, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments } from "../schema/index.ts";

/** Who would ship on one order's marketplace label. */
export interface OrderLabelParcels {
  /** The order's own parcels, one per supplier: more than one means the order was split. */
  parcelCount: number;
  /** The suppliers with a parcel in the order or, for an order bought in a cart, in the cart. */
  supplierIds: string[];
}

/**
 * The parcels one marketplace label would have to serve. A Mercado Livre cart (`pack_id`)
 * ships in one package with one label, so every order of the cart counts, not only this one.
 * An order of another tenant, or one that does not exist, has none.
 */
export async function findOrderLabelParcels(
  database: Database,
  tenantId: string,
  orderId: string,
): Promise<OrderLabelParcels> {
  const [order] = await database
    .select({ storeConnectionId: orders.storeConnectionId, packId: orders.marketplacePackId })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));
  if (order === undefined) {
    return { parcelCount: 0, supplierIds: [] };
  }
  const sameLabel: SQL | undefined =
    order.packId === null
      ? eq(orders.id, orderId)
      : and(
          eq(orders.storeConnectionId, order.storeConnectionId),
          eq(orders.marketplacePackId, order.packId),
        );
  const [own, suppliers] = await Promise.all([
    database
      .select({ parcels: count() })
      .from(orderShipments)
      .where(and(eq(orderShipments.tenantId, tenantId), eq(orderShipments.orderId, orderId))),
    database
      .selectDistinct({ supplierId: orderShipments.supplierId })
      .from(orderShipments)
      .innerJoin(orders, eq(orders.id, orderShipments.orderId))
      .where(and(eq(orders.tenantId, tenantId), sameLabel)),
  ]);
  return {
    parcelCount: own[0]?.parcels ?? 0,
    supplierIds: suppliers.map((row) => row.supplierId),
  };
}
