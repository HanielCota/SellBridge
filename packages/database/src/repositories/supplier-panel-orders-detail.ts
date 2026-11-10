import { notFoundError } from "@sellbridge/shared/errors";
import { SETTLED_FULFILLMENT_STATUSES } from "@sellbridge/shared/schemas";
import { supplierLabelState } from "@sellbridge/shared/supplier-order-labels";
import { describeQueueEntry } from "@sellbridge/shared/supplier-panel-orders";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  orderItems,
  orders,
  orderShipments,
  shipmentEvents,
  storeConnections,
  suppliers,
} from "../schema/index.ts";
import { findSupplierShipmentInvoice } from "./shipment-invoices.ts";
import { supplierDeadlines, supplierTimingColumns } from "./shipment-timing.ts";

/** What the supplier receives for the parcel: each item's cost times its quantity, in cents. */
async function receivableCents(
  database: Database,
  orderId: string,
  items: readonly { orderItemId: string; quantity: number }[],
): Promise<number> {
  if (items.length === 0) {
    return 0;
  }
  const costs = await database
    .select({ id: orderItems.id, unitCostCents: orderItems.unitCostCents })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, orderId),
        inArray(
          orderItems.id,
          items.map((item) => item.orderItemId),
        ),
      ),
    );
  const costById = new Map(costs.map((cost) => [cost.id, cost.unitCostCents]));
  return items.reduce(
    (total, item) => total + (costById.get(item.orderItemId) ?? 0) * item.quantity,
    0,
  );
}

/** The parcel's row with its order, store and supplier; another supplier's is "not found". */
async function panelShipmentRow(
  database: Database,
  input: { supplierId: string; shipmentId: string },
) {
  const [row] = await database
    .select({
      shipment: orderShipments,
      externalOrderId: orders.externalOrderId,
      orderStatus: orders.status,
      marketplace: storeConnections.marketplace,
      shopName: storeConnections.shopName,
      buyerName: orders.buyerName,
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
  return row;
}

/**
 * One of the supplier's parcels for the shipment panel: what the supplier link
 * (`getSupplierShipment`) shows, plus the reseller's store, the buyer's name, what the supplier
 * receives, the label records and the NF-e. No link token, no tenant, no buyer contact, and no buyer
 * address once the parcel is settled or the sale was cancelled or returned. Another supplier's
 * parcel is "not found".
 */
export async function getSupplierPanelShipment(
  database: Database,
  input: { supplierId: string; shipmentId: string },
  now: Date = new Date(),
) {
  const row = await panelShipmentRow(database, input);
  const {
    supplierTokenHash: _hash,
    supplierTokenExpiresAt: _expiry,
    buyerTokenHash: _buyerHash,
    tenantId: _tenant,
    ...shipment
  } = row.shipment;
  const [events, receivable, invoice] = await Promise.all([
    database
      .select()
      .from(shipmentEvents)
      .where(eq(shipmentEvents.shipmentId, shipment.id))
      .orderBy(asc(shipmentEvents.createdAt), asc(shipmentEvents.id)),
    receivableCents(database, shipment.orderId, shipment.items),
    findSupplierShipmentInvoice(database, input),
  ]);
  const entry = describeQueueEntry({ ...shipment, ...row }, now, { orderStatus: row.orderStatus });
  const over =
    SETTLED_FULFILLMENT_STATUSES.includes(shipment.status) ||
    ["cancelled", "returned"].includes(row.orderStatus);
  return {
    ...shipment,
    address: over ? null : shipment.address,
    externalOrderId: row.externalOrderId,
    orderStatus: row.orderStatus,
    marketplace: row.marketplace,
    shopName: row.shopName,
    buyerName: row.buyerName,
    receivableCents: receivable,
    labelState: supplierLabelState({
      ...shipment,
      marketplace: row.marketplace,
      overdue: entry.urgency === "overdue",
    }),
    supplierName: row.supplierName,
    ...supplierDeadlines(shipment, row),
    events,
    /** The parcel's NF-e issued through the supplier's ERP; null while there is none. */
    invoice,
  };
}
