import { notFoundError } from "@sellbridge/shared/errors";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments, shipmentEvents, storeConnections } from "../schema/index.ts";
import { firstShippedAt } from "./shipment-timing.ts";
import { hashSupplierToken } from "./supplier-link.ts";

/**
 * Saves the hash of the buyer's tracking token on the reseller's parcel. The token itself is
 * derived from the parcel id by the web app, so asking again gives the same link the buyer may
 * already have; only the hash is stored, like the supplier link.
 */
export async function saveBuyerTrackingToken(
  database: Database,
  input: { tenantId: string; shipmentId: string; token: string },
): Promise<void> {
  const [saved] = await database
    .update(orderShipments)
    .set({ buyerTokenHash: hashSupplierToken(input.token) })
    .where(
      and(eq(orderShipments.id, input.shipmentId), eq(orderShipments.tenantId, input.tenantId)),
    )
    .returning({ id: orderShipments.id });
  if (saved === undefined) {
    throw notFoundError(`Envio ${input.shipmentId} não encontrado. Atualize o pedido.`);
  }
}

/**
 * What the buyer's page may show: the store's name, never the supplier's; the city, never the
 * address; the steps without who did them. Null when no parcel has that token.
 */
export async function getBuyerTracking(database: Database, token: string) {
  const [row] = await database
    .select({
      shipmentId: orderShipments.id,
      status: orderShipments.status,
      carrier: orderShipments.carrier,
      trackingCode: orderShipments.trackingCode,
      trackingUrl: orderShipments.trackingUrl,
      estimatedDeliveryAt: orderShipments.estimatedDeliveryAt,
      shippedAt: firstShippedAt,
      items: orderShipments.items,
      city: orderShipments.address,
      externalOrderId: orders.externalOrderId,
      orderedAt: orders.orderedAt,
      storeName: storeConnections.shopName,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .where(eq(orderShipments.buyerTokenHash, hashSupplierToken(token)))
    .limit(1);
  if (row === undefined) {
    return null;
  }
  const steps = await database
    .select({ status: shipmentEvents.status, createdAt: shipmentEvents.createdAt })
    .from(shipmentEvents)
    .where(eq(shipmentEvents.shipmentId, row.shipmentId))
    .orderBy(asc(shipmentEvents.createdAt));
  const { city: address, shipmentId: _shipmentId, ...parcel } = row;
  return {
    ...parcel,
    destination: `${address.city}/${address.state}`,
    items: row.items.map((item) => ({ title: item.title, quantity: item.quantity })),
    steps,
  };
}
