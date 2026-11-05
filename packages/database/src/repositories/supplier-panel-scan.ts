import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments } from "../schema/index.ts";
import { normalizedTrackingCode } from "./shipment-tracking.ts";

/** Steps a scan can find a parcel in: from waiting for the accept until it leaves. */
const SCANNABLE_STATUSES = ["forwarded", "accepted", "picking", "ready"] as const;

/**
 * The supplier's open parcels whose order number, tracking code or marketplace shipment id is
 * the scanned text: what a barcode reader types from the label. At most two come back, enough
 * to tell a unique match from an ambiguous one.
 */
export async function findSupplierShipmentsByCode(
  database: Database,
  supplierId: string,
  code: string,
) {
  const typed = code.trim();
  if (typed === "") {
    return [];
  }
  const byOrderNumber = sql`upper(${orders.externalOrderId}) = upper(${typed})`;
  const byTrackingCode = sql`${normalizedTrackingCode} = upper(regexp_replace(${typed}, '[[:space:].-]', '', 'g'))`;
  // The Mercado Livre label's barcode is its shipment id, kept when the label was emitted.
  const byMarketplaceShipment = eq(orderShipments.marketplaceShipmentId, typed);
  return database
    .select({
      id: orderShipments.id,
      status: orderShipments.status,
      orderStatus: orders.status,
      externalOrderId: orders.externalOrderId,
      carrier: orderShipments.carrier,
      trackingCode: orderShipments.trackingCode,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .where(
      and(
        eq(orderShipments.supplierId, supplierId),
        inArray(orderShipments.status, [...SCANNABLE_STATUSES]),
        or(byOrderNumber, byTrackingCode, byMarketplaceShipment),
      ),
    )
    .limit(2);
}
