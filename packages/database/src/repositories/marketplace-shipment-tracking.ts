import {
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notExists,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import {
  DISPATCHED_FULFILLMENT_STATUSES,
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
    logisticType?: string | null;
    estimatedDeliveryAt?: Date | null;
    dispatchDeadlineAt?: Date | null;
    shipmentId?: string | null;
  },
  shipment: typeof orderShipments.$inferSelect,
) {
  const now = new Date();
  return {
    carrier: shipping.carrier ?? shipment.carrier,
    trackingCode: shipping.trackingCode ?? shipment.trackingCode,
    marketplaceLogisticType: shipping.logisticType ?? shipment.marketplaceLogisticType,
    estimatedDeliveryAt: shipping.estimatedDeliveryAt ?? shipment.estimatedDeliveryAt,
    dispatchDeadlineAt: shipping.dispatchDeadlineAt ?? shipment.dispatchDeadlineAt,
    // Kept once known, so a shipment notification finds the order without asking the marketplace.
    marketplaceShipmentId: shipment.marketplaceShipmentId ?? shipping.shipmentId ?? null,
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
 * While a store's shipment notifications keep arriving, the periodic job re-reads its parcels
 * only this rarely: the notification already brings each change within seconds.
 */
export const NOTIFIED_TRACKING_INTERVAL_MILLISECONDS = 6 * 60 * 60 * 1000;
/** A store counts as notified while its last shipment notification is at most this old. */
export const SHIPMENT_NOTICE_FRESHNESS_MILLISECONDS = 24 * 60 * 60 * 1000;
/** Most orders one shipment notification may name: a cart holds a handful. */
const MAX_SHIPMENT_ORDER_IDS = 50;

/** An order's single parcel still on its way, in a connected Mercado Livre store with a token. */
function trackableOrders(database: Database, extra: SQL | undefined) {
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
        // A sale cancelled after its parcel left is still followed: the parcel comes back.
        or(
          inArray(orders.status, ["paid", "shipped"]),
          and(eq(orders.status, "cancelled"), eq(orderShipments.status, "shipped")),
        ),
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
        extra,
      ),
    );
}

/**
 * Orders of connected Mercado Livre stores with their single parcel still on its way, the least
 * recently read first, across tenants: the worker's tracking job reads each one with its store's
 * token. Orders split between suppliers are left out: the marketplace has one parcel for them,
 * and they are tracked by hand per supplier. Stores whose token already expired wait for the
 * token refresh job. A store whose shipment notifications arrive has its parcels read again
 * only after `NOTIFIED_TRACKING_INTERVAL_MILLISECONDS`.
 */
export async function listShipmentsToTrack(
  database: Database,
  options: { limit: number; now?: Date },
) {
  const now = options.now ?? new Date();
  const noticeFreshSince = new Date(now.getTime() - SHIPMENT_NOTICE_FRESHNESS_MILLISECONDS);
  const readDueBefore = new Date(now.getTime() - NOTIFIED_TRACKING_INTERVAL_MILLISECONDS);
  const due = or(
    isNull(storeConnections.lastShipmentNoticeAt),
    lt(storeConnections.lastShipmentNoticeAt, noticeFreshSince),
    isNull(orderShipments.trackedAt),
    lt(orderShipments.trackedAt, readDueBefore),
  );
  return trackableOrders(database, due)
    .orderBy(sql`${orderShipments.trackedAt} asc nulls first`)
    .limit(options.limit);
}

/**
 * The store's orders still on their way named by a shipment notification: by the shipment id
 * already stored on the parcel, or by the marketplace order ids the shipment holds.
 */
export async function listTrackableStoreOrders(
  database: Database,
  input: {
    storeConnectionId: string;
    match: { marketplaceShipmentId: string } | { externalOrderIds: readonly string[] };
  },
) {
  const { match } = input;
  if ("externalOrderIds" in match && match.externalOrderIds.length === 0) {
    return [];
  }
  const named =
    "marketplaceShipmentId" in match
      ? eq(orderShipments.marketplaceShipmentId, match.marketplaceShipmentId)
      : inArray(orders.externalOrderId, match.externalOrderIds.slice(0, MAX_SHIPMENT_ORDER_IDS));
  return trackableOrders(database, and(eq(storeConnections.id, input.storeConnectionId), named));
}

/** The marketplace just sent a shipment notification about the store; a late one never rewinds. */
export async function recordStoreShipmentNotice(
  database: Database,
  input: { storeConnectionId: string; receivedAt: Date },
): Promise<void> {
  const receivedAt = input.receivedAt.toISOString();
  await database
    .update(storeConnections)
    .set({
      lastShipmentNoticeAt: sql`greatest(coalesce(${storeConnections.lastShipmentNoticeAt}, ${receivedAt}::timestamptz), ${receivedAt}::timestamptz)`,
    })
    .where(eq(storeConnections.id, input.storeConnectionId));
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

/** The order's single parcel the marketplace reading applies to, locked. */
async function trackedParcelOf(transaction: Transaction, order: typeof orders.$inferSelect) {
  const shipments = await transaction
    .select()
    .from(orderShipments)
    .where(and(eq(orderShipments.orderId, order.id), eq(orderShipments.tenantId, order.tenantId)))
    .for("update");
  if (shipments.length !== 1)
    throw conflictError(
      "A consulta automática requer um único envio encaminhado; pedidos divididos precisam de rastreio por fornecedor",
    );
  const shipment = shipments[0];
  if (!shipment || shipment.status === "cancelled") throw conflictError("Envio cancelado");
  // A cancelled sale is only followed for a parcel that already left: it comes back as a return.
  const leftAlready = DISPATCHED_FULFILLMENT_STATUSES.includes(shipment.status);
  if (order.status === "cancelled" && !leftAlready) throw conflictError("Pedido cancelado");
  return shipment;
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
    /** How the marketplace moves the parcel (pickup, drop-off, Flex); kept when absent. */
    logisticType?: string | null;
    /** The marketplace's dates; a reading without them keeps the ones already known. */
    estimatedDeliveryAt?: Date | null;
    dispatchDeadlineAt?: Date | null;
    /** The marketplace's own shipment id, stored once known. */
    shipmentId?: string | null;
  },
) {
  return database.transaction(async (transaction) => {
    const [order] = await transaction
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
      .for("update");
    if (!order) throw notFoundError("Pedido não encontrado");
    // Settled: a later reading (the return seen again, a lagging "shipped") changes nothing.
    if (order.status === "returned") return { changed: false };
    const shipment = await trackedParcelOf(transaction, order);
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
