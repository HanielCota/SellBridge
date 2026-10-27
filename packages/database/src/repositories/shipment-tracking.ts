import { and, asc, desc, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments, storeConnections, suppliers } from "../schema/index.ts";
import { shipmentTimingColumns, withShipmentDelay } from "./shipment-timing.ts";

/**
 * Which parcels the tracking screen reads: every parcel of one order, or the parcels whose
 * tracking code or order number is exactly what the reseller typed.
 */
export type TrackedParcelFilter =
  | { kind: "order"; orderId: string }
  | { kind: "shipment"; shipmentId: string }
  | { kind: "search"; trackingCode: string; externalOrderId: string };

/**
 * Who reads: the reseller (its tenant), a supplier (only its own parcels, never the reseller's
 * own-stock ones) or staff answering a ticket (any parcel; the route checks the permission).
 */
export type TrackedParcelScope = { tenantId: string } | { supplierId: string } | { staff: true };

function trackedParcelScope(scope: TrackedParcelScope): SQL | undefined {
  if ("tenantId" in scope) {
    return and(eq(orderShipments.tenantId, scope.tenantId), eq(orders.tenantId, scope.tenantId));
  }
  if ("supplierId" in scope) {
    return and(
      eq(orderShipments.supplierId, scope.supplierId),
      eq(suppliers.catalogKind, "supplier"),
    );
  }
  return undefined;
}

/** Spaces, dots and dashes are typing noise in a code: compared without them, in capitals. */
const normalizedTrackingCode = sql`upper(regexp_replace(${orderShipments.trackingCode}, '[[:space:].-]', '', 'g'))`;

function trackedParcelCondition(filter: TrackedParcelFilter): SQL | undefined {
  if (filter.kind === "order") {
    return eq(orders.id, filter.orderId);
  }
  if (filter.kind === "shipment") {
    return eq(orderShipments.id, filter.shipmentId);
  }
  const byOrderNumber = sql`upper(${orders.externalOrderId}) = upper(${filter.externalOrderId})`;
  // Text that is only typing noise ("." or "-") normalizes to nothing: it names no code, and
  // compared as is it would match every parcel whose code is made of noise too.
  if (filter.trackingCode === "") {
    return byOrderNumber;
  }
  return sql`(${normalizedTrackingCode} = ${filter.trackingCode} or ${byOrderNumber})`;
}

/** Most parcels one search may show: one order rarely has more than a few suppliers. */
const TRACKED_PARCELS_LIMIT = 20;

const trackedParcelColumns = {
  shipmentId: orderShipments.id,
  orderId: orders.id,
  externalOrderId: orders.externalOrderId,
  orderedAt: orders.orderedAt,
  storeName: storeConnections.shopName,
  supplierName: suppliers.name,
  catalogKind: suppliers.catalogKind,
  carrier: orderShipments.carrier,
  trackingCode: orderShipments.trackingCode,
  trackingUrl: orderShipments.trackingUrl,
  ...shipmentTimingColumns,
};

/** Parcels for the tracking screen, with what is late and the supplier's dates. */
export async function listTrackedParcels(
  database: Database,
  scope: TrackedParcelScope,
  filter: TrackedParcelFilter,
) {
  const rows = await database
    .select(trackedParcelColumns)
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(and(trackedParcelScope(scope), trackedParcelCondition(filter)))
    .orderBy(desc(orders.orderedAt), asc(orderShipments.createdAt))
    .limit(TRACKED_PARCELS_LIMIT);
  const now = new Date();
  return rows.map((row) => withShipmentDelay(row, now));
}

/**
 * Parcels on their way (sent, with a tracking code), the most recent orders first: the ones a
 * reseller taps instead of typing a code.
 */
export async function listParcelsInTransit(database: Database, tenantId: string, limit: number) {
  const rows = await database
    .select(trackedParcelColumns)
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(
        eq(orderShipments.tenantId, tenantId),
        eq(orders.tenantId, tenantId),
        eq(orderShipments.status, "shipped"),
        isNotNull(orderShipments.trackingCode),
      ),
    )
    .orderBy(desc(orders.orderedAt), asc(orderShipments.createdAt))
    .limit(limit);
  const now = new Date();
  return rows.map((row) => withShipmentDelay(row, now));
}
