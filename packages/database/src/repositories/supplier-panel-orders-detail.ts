import { notFoundError } from "@sellbridge/shared/errors";
import { SETTLED_FULFILLMENT_STATUSES } from "@sellbridge/shared/schemas";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  orders,
  orderShipments,
  shipmentEvents,
  storeConnections,
  suppliers,
} from "../schema/index.ts";
import { supplierDeadlines, supplierTimingColumns } from "./shipment-timing.ts";

/**
 * One of the supplier's parcels for the shipment panel, with exactly what the supplier link
 * (`getSupplierShipment`) shows: no link token, no tenant, and no buyer address once the parcel
 * is settled or the sale was cancelled or returned. Another supplier's parcel is "not found".
 */
export async function getSupplierPanelShipment(
  database: Database,
  input: { supplierId: string; shipmentId: string },
) {
  const [row] = await database
    .select({
      shipment: orderShipments,
      externalOrderId: orders.externalOrderId,
      orderStatus: orders.status,
      marketplace: storeConnections.marketplace,
      supplierName: suppliers.name,
      ...supplierTimingColumns,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(eq(orderShipments.id, input.shipmentId), eq(orderShipments.supplierId, input.supplierId)),
    );
  if (row === undefined) {
    throw notFoundError(`Pedido ${input.shipmentId} não encontrado. Atualize a lista.`);
  }
  const {
    supplierTokenHash: _hash,
    supplierTokenExpiresAt: _expiry,
    buyerTokenHash: _buyerHash,
    tenantId: _tenant,
    ...shipment
  } = row.shipment;
  const events = await database
    .select()
    .from(shipmentEvents)
    .where(eq(shipmentEvents.shipmentId, shipment.id))
    .orderBy(asc(shipmentEvents.createdAt), asc(shipmentEvents.id));
  const over =
    SETTLED_FULFILLMENT_STATUSES.includes(shipment.status) ||
    ["cancelled", "returned"].includes(row.orderStatus);
  return {
    ...shipment,
    address: over ? null : shipment.address,
    externalOrderId: row.externalOrderId,
    orderStatus: row.orderStatus,
    marketplace: row.marketplace,
    supplierName: row.supplierName,
    ...supplierDeadlines(shipment, row),
    events,
  };
}
