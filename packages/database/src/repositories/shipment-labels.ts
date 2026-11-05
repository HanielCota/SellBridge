import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments, storeConnections } from "../schema/index.ts";

/** An order whose marketplace label was emitted, with the shipment id its barcode carries. */
export interface PrintedLabelRecord {
  orderId: string;
  marketplaceShipmentId: string;
}

/**
 * Records that the marketplace label of these orders was emitted now: the count goes up, the
 * time and the marketplace's shipment id are kept (the barcode check reads it), and a "not
 * released yet" mark clears. Read back as `supplierLabelState`.
 */
export async function recordLabelsPrinted(
  database: Database,
  labels: readonly PrintedLabelRecord[],
  now: Date = new Date(),
): Promise<void> {
  if (labels.length === 0) {
    return;
  }
  await database.transaction(async (transaction) => {
    // One order after the other: each one keeps its own marketplace shipment id.
    for (const label of labels) {
      await transaction
        .update(orderShipments)
        .set({
          labelPrintedAt: now,
          labelPrintCount: sql`${orderShipments.labelPrintCount} + 1`,
          labelWaitingSince: null,
          marketplaceShipmentId: label.marketplaceShipmentId,
        })
        .where(eq(orderShipments.orderId, label.orderId));
    }
  });
}

/**
 * Records that the marketplace has not released these orders' labels yet. The first refusal's
 * time is kept, and a label already emitted stays "printed".
 */
export async function recordLabelsWaiting(
  database: Database,
  orderIds: readonly string[],
  now: Date = new Date(),
): Promise<void> {
  if (orderIds.length === 0) {
    return;
  }
  await database
    .update(orderShipments)
    .set({
      labelWaitingSince: sql`coalesce(${orderShipments.labelWaitingSince}, ${now.toISOString()}::timestamptz)`,
    })
    .where(
      and(inArray(orderShipments.orderId, [...orderIds]), eq(orderShipments.labelPrintCount, 0)),
    );
}

/** What a batch of labels needs to know of each selected parcel of the supplier. */
export async function supplierLabelShipments(
  database: Database,
  supplierId: string,
  shipmentIds: readonly string[],
) {
  if (shipmentIds.length === 0) {
    return [];
  }
  return database
    .select({
      id: orderShipments.id,
      orderId: orderShipments.orderId,
      tenantId: orderShipments.tenantId,
      status: orderShipments.status,
      orderStatus: orders.status,
      storeId: storeConnections.id,
      shopName: storeConnections.shopName,
      marketplace: storeConnections.marketplace,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .where(
      and(eq(orderShipments.supplierId, supplierId), inArray(orderShipments.id, [...shipmentIds])),
    );
}
