import { and, eq, gt, inArray, isNotNull, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import {
  type FulfillmentStatus,
  type MarketplaceTrackingStatus,
  SETTLED_FULFILLMENT_STATUSES,
  SHIPMENT_ACTORS,
} from "@sellbridge/shared/schemas";
import type { Database, Transaction } from "../client.ts";
import { orders, orderShipments, shipmentEvents, storeConnections } from "../schema/index.ts";
import { syncOrderFromShipments } from "./fulfillment-status.ts";
import { queueShipmentProblemNotices } from "./notification-shipment-problems.ts";
import { linkFieldsFor } from "./shipment-link-fields.ts";

/**
 * The marketplace's tracking, applied over the supplier's progress: null (the parcel has not left)
 * changes nothing, and a settled shipment keeps its status: later readings lag behind. `status` is the raw marketplace value,
 * kept in the history note.
 */
function trackedShipmentStatus(
  current: FulfillmentStatus,
  tracking: MarketplaceTrackingStatus | null,
): FulfillmentStatus {
  if (tracking === null || SETTLED_FULFILLMENT_STATUSES.includes(current)) return current;
  return tracking;
}

/** What a marketplace reading writes besides the status; absent values keep what is stored. */
function trackedValues(
  shipping: {
    carrier: string | null;
    trackingCode: string | null;
    estimatedDeliveryAt?: Date | null;
    dispatchDeadlineAt?: Date | null;
  },
  shipment: typeof orderShipments.$inferSelect,
) {
  const now = new Date();
  return {
    carrier: shipping.carrier ?? shipment.carrier,
    trackingCode: shipping.trackingCode ?? shipment.trackingCode,
    estimatedDeliveryAt: shipping.estimatedDeliveryAt ?? shipment.estimatedDeliveryAt,
    dispatchDeadlineAt: shipping.dispatchDeadlineAt ?? shipment.dispatchDeadlineAt,
    trackedAt: now,
    updatedAt: now,
  };
}

/**
 * Parcels on their way, written as constants (not parameters) so the query matches the partial
 * index `order_shipments_tracking_idx`.
 */
const ON_THE_WAY = sql.raw("('forwarded','accepted','picking','ready','shipped')");
const otherShipments = alias(orderShipments, "other_shipments");

/**
 * Orders of connected Mercado Livre stores with their single parcel still on its way, the least
 * recently read first, across tenants: the worker's tracking job reads each one with its store's
 * token. Orders split between suppliers are left out: the marketplace has one parcel for them,
 * and they are tracked by hand per supplier. Stores whose token already expired wait for the
 * token refresh job.
 */
export async function listShipmentsToTrack(database: Database, options: { limit: number }) {
  return database
    .select({
      tenantId: orderShipments.tenantId,
      orderId: orderShipments.orderId,
      externalOrderId: orders.externalOrderId,
      storeConnectionId: storeConnections.id,
      externalShopId: storeConnections.externalShopId,
      accessTokenEnc: storeConnections.accessTokenEnc,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(
      storeConnections,
      and(
        eq(storeConnections.id, orders.storeConnectionId),
        eq(storeConnections.tenantId, orders.tenantId),
      ),
    )
    .where(
      and(
        sql`${orderShipments.status} in ${ON_THE_WAY}`,
        inArray(orders.status, ["paid", "shipped"]),
        eq(storeConnections.marketplace, "mercado_livre"),
        eq(storeConnections.status, "connected"),
        isNotNull(storeConnections.accessTokenEnc),
        or(isNull(storeConnections.expiresAt), gt(storeConnections.expiresAt, new Date())),
        notExists(
          database
            .select({ id: otherShipments.id })
            .from(otherShipments)
            .where(
              and(
                eq(otherShipments.orderId, orderShipments.orderId),
                ne(otherShipments.id, orderShipments.id),
              ),
            ),
        ),
      ),
    )
    .orderBy(sql`${orderShipments.trackedAt} asc nulls first`)
    .limit(options.limit);
}

/** Marks an order's parcels as just read, so a failing read goes to the back of the line. */
export async function touchShipmentTracking(database: Database, tenantId: string, orderId: string) {
  await database
    .update(orderShipments)
    .set({ trackedAt: new Date() })
    .where(and(eq(orderShipments.orderId, orderId), eq(orderShipments.tenantId, tenantId)));
}

/** A parcel the marketplace just reported as not delivered or returned warns both sides. */
async function noticeDeliveryProblem(
  transaction: Transaction,
  shipment: typeof orderShipments.$inferSelect,
  order: typeof orders.$inferSelect,
  status: FulfillmentStatus,
) {
  if (status !== "not_delivered" && status !== "returned") {
    return;
  }
  await queueShipmentProblemNotices(transaction, {
    shipmentId: shipment.id,
    tenantId: shipment.tenantId,
    supplierId: shipment.supplierId,
    orderId: order.id,
    externalOrderId: order.externalOrderId,
    problem: status,
  });
}

/** One marketplace parcel cannot be assigned to several suppliers' separate parcels. */
export async function applyMarketplaceShipment(
  database: Database,
  tenantId: string,
  orderId: string,
  shipping: {
    status: string;
    trackingStatus: MarketplaceTrackingStatus | null;
    /** The buyer's return parcel reached the seller: the order is returned. */
    buyerReturnDelivered: boolean;
    carrier: string | null;
    trackingCode: string | null;
    /** The marketplace's dates; a reading without them keeps the ones already known. */
    estimatedDeliveryAt?: Date | null;
    dispatchDeadlineAt?: Date | null;
  },
) {
  return database.transaction(async (transaction) => {
    const [order] = await transaction
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
      .for("update");
    if (!order) throw notFoundError("Pedido não encontrado");
    if (order.status === "cancelled") throw conflictError("Pedido cancelado");
    // Settled: a later reading (the return seen again, a lagging "shipped") changes nothing.
    if (order.status === "returned") return { changed: false };
    const shipments = await transaction
      .select()
      .from(orderShipments)
      .where(and(eq(orderShipments.orderId, orderId), eq(orderShipments.tenantId, tenantId)))
      .for("update");
    if (shipments.length !== 1)
      throw conflictError(
        "A consulta automática requer um único envio encaminhado; pedidos divididos precisam de rastreio por fornecedor",
      );
    const shipment = shipments[0];
    if (!shipment || shipment.status === "cancelled") throw conflictError("Envio cancelado");
    const status = trackedShipmentStatus(shipment.status, shipping.trackingStatus);
    await transaction
      .update(orderShipments)
      .set({ status, ...trackedValues(shipping, shipment), ...linkFieldsFor(status) })
      .where(eq(orderShipments.id, shipment.id));
    const newTrackingCode =
      shipping.trackingCode && shipping.trackingCode !== shipment.trackingCode
        ? shipping.trackingCode
        : null;
    if (status !== shipment.status || newTrackingCode)
      await transaction.insert(shipmentEvents).values({
        shipmentId: shipment.id,
        status,
        actor: SHIPMENT_ACTORS.marketplace,
        // The status label says what happened; the note only adds a tracking code that just arrived.
        note: newTrackingCode ? `Código de rastreio ${newTrackingCode}` : "",
      });
    if (status !== shipment.status)
      await noticeDeliveryProblem(transaction, shipment, order, status);
    await syncOrderFromShipments(transaction, order, {
      buyerReturned: shipping.buyerReturnDelivered,
    });
    return { changed: status !== shipment.status || newTrackingCode !== null };
  });
}
