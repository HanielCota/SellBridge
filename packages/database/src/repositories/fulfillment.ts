import { syncOrderFromShipments } from "./fulfillment-status.ts";
import { firstShippedAt, withShipmentDelay } from "./shipment-timing.ts";
import { createHash, randomBytes } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { conflictError, notFoundError, validationError } from "@sellbridge/shared/errors";
import {
  DISPATCHED_FULFILLMENT_STATUSES,
  DELIVERY_CONFIRMED_BY,
  FULFILLMENT_NEXT,
  type FulfillmentStatus,
  type forwardOrderSchema,
  type MarketplaceTrackingStatus,
  SETTLED_FULFILLMENT_STATUSES,
  SHIPMENT_ACTORS,
  type ShipmentOperator,
  type operationsSearchSchema,
  type shipmentUpdateSchema,
} from "@sellbridge/shared/schemas";
import type { z } from "zod";
import type { Database, Transaction } from "../client.ts";
import {
  orderItems,
  orders,
  orderShipments,
  shipmentEvents,
  storeConnections,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { containsPattern } from "./sql/search-pattern.ts";
import { FORWARD_CREDIT, type ForwardActor, supplierGroups } from "./supplier-groups.ts";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A new supplier link: the raw token goes to the reseller, only its hash is stored. */
function issueSupplierLink(): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}

/** The operations list's filters; dates are already resolved to Brazil calendar days. */
export interface OperationalSearch {
  query: string;
  stage: z.infer<typeof operationsSearchSchema>["stage"];
  page: number;
  store?: string | undefined;
  /** Sale dates from (inclusive) and before (exclusive). */
  orderedFrom?: Date | undefined;
  orderedTo?: Date | undefined;
}

function operationalFilter(database: Database, tenantId: string, search: OperationalSearch) {
  const shipmentMatch = and(
    eq(orderShipments.orderId, orders.id),
    eq(orderShipments.tenantId, tenantId),
  );
  const stage = search.stage;
  const stageFilter =
    stage === "all"
      ? undefined
      : stage === "unforwarded"
        ? and(
            eq(orders.status, "paid"),
            notExists(
              database.select({ id: orderShipments.id }).from(orderShipments).where(shipmentMatch),
            ),
          )
        : exists(
            database
              .select({ id: orderShipments.id })
              .from(orderShipments)
              .where(and(shipmentMatch, eq(orderShipments.status, stage))),
          );
  const term = containsPattern(search.query);
  return and(
    eq(orders.tenantId, tenantId),
    stageFilter,
    search.query
      ? or(ilike(orders.externalOrderId, term), ilike(orders.buyerName, term))
      : undefined,
    search.store ? eq(orders.storeConnectionId, search.store) : undefined,
    search.orderedFrom ? gte(orders.orderedAt, search.orderedFrom) : undefined,
    search.orderedTo ? lt(orders.orderedAt, search.orderedTo) : undefined,
  );
}

async function operationalShipments(database: Database, tenantId: string, ids: string[]) {
  return ids.length
    ? await database
        .select({
          id: orderShipments.id,
          orderId: orderShipments.orderId,
          status: orderShipments.status,
          supplierName: suppliers.name,
          trackingCode: orderShipments.trackingCode,
          dispatchDeadlineAt: orderShipments.dispatchDeadlineAt,
          estimatedDeliveryAt: orderShipments.estimatedDeliveryAt,
          shippedAt: firstShippedAt,
        })
        .from(orderShipments)
        .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
        .where(and(eq(orderShipments.tenantId, tenantId), inArray(orderShipments.orderId, ids)))
    : [];
}

const OPERATIONS_PAGE_SIZE = 20;

async function countOperationalOrders(database: Database, filter: SQL | undefined) {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(orders)
    .where(filter);
  return row?.total ?? 0;
}

async function operationalOrderRows(database: Database, filter: SQL | undefined, page: number) {
  return database
    .select({
      id: orders.id,
      externalOrderId: orders.externalOrderId,
      status: orders.status,
      buyerName: orders.buyerName,
      orderedAt: orders.orderedAt,
      storeName: storeConnections.shopName,
      /** An item is short of supplier stock (the reseller has to sort it out). */
      stockShort: sql<boolean>`exists (select 1 from ${orderItems} where ${orderItems.orderId} = ${orders.id} and ${orderItems.stockState} = 'short')`,
    })
    .from(orders)
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .where(filter)
    .orderBy(desc(orders.orderedAt), asc(orders.id))
    .limit(OPERATIONS_PAGE_SIZE)
    .offset((page - 1) * OPERATIONS_PAGE_SIZE);
}

export async function listOperationalOrders(
  database: Database,
  tenantId: string,
  search: OperationalSearch,
) {
  const filter = operationalFilter(database, tenantId, search);
  const total = await countOperationalOrders(database, filter);
  const totalPages = Math.ceil(total / OPERATIONS_PAGE_SIZE);
  // The page lives in the address: after a forward or a shared link it can point past the end.
  // The last page with orders is shown then, never an empty list without a pager.
  const page = Math.min(search.page, Math.max(1, totalPages));
  const now = new Date();
  const rows = await operationalOrderRows(database, filter, page);
  const shipments = await operationalShipments(
    database,
    tenantId,
    rows.map((row) => row.id),
  );
  return {
    items: rows.map((row) => ({
      ...row,
      shipments: shipments
        .filter((shipment) => shipment.orderId === row.id)
        .map((shipment) => withShipmentDelay(shipment, now)),
    })),
    page,
    total,
    totalPages,
  };
}

async function eventsForShipments(database: Database, ids: string[]) {
  return ids.length
    ? await database
        .select()
        .from(shipmentEvents)
        .where(inArray(shipmentEvents.shipmentId, ids))
        .orderBy(asc(shipmentEvents.createdAt), asc(shipmentEvents.id))
    : [];
}

function fulfillmentItems(database: Database, tenantId: string, orderId: string) {
  return database
    .select({
      id: orderItems.id,
      title: orderItems.title,
      quantity: orderItems.quantity,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      sku: supplierProducts.sku,
    })
    .from(orderItems)
    .leftJoin(supplierProducts, eq(supplierProducts.id, orderItems.supplierProductId))
    .leftJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.tenantId, tenantId)));
}

/** The order's parcels for the operations dialog and the order page, oldest first. */
function detailShipments(database: Database, tenantId: string, orderId: string) {
  return database
    .select({
      id: orderShipments.id,
      supplierId: orderShipments.supplierId,
      supplierName: suppliers.name,
      status: orderShipments.status,
      address: orderShipments.address,
      items: orderShipments.items,
      notes: orderShipments.notes,
      carrier: orderShipments.carrier,
      trackingCode: orderShipments.trackingCode,
      trackingUrl: orderShipments.trackingUrl,
      estimatedDeliveryAt: orderShipments.estimatedDeliveryAt,
      dispatchDeadlineAt: orderShipments.dispatchDeadlineAt,
      trackedAt: orderShipments.trackedAt,
      shippedAt: firstShippedAt,
      updatedAt: orderShipments.updatedAt,
      supplierTokenExpiresAt: orderShipments.supplierTokenExpiresAt,
    })
    .from(orderShipments)
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(and(eq(orderShipments.orderId, orderId), eq(orderShipments.tenantId, tenantId)))
    .orderBy(asc(orderShipments.createdAt));
}

export async function getFulfillmentDetail(database: Database, tenantId: string, orderId: string) {
  const [order] = await database
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));
  if (!order) throw notFoundError("Pedido não encontrado");
  const [items, shipments, stores] = await Promise.all([
    fulfillmentItems(database, tenantId, orderId),
    detailShipments(database, tenantId, orderId),
    database
      .select({ marketplace: storeConnections.marketplace })
      .from(storeConnections)
      .where(
        and(
          eq(storeConnections.id, order.storeConnectionId),
          eq(storeConnections.tenantId, tenantId),
        ),
      ),
  ]);
  const [store] = stores;
  if (!store) throw notFoundError("Loja do pedido não encontrada");
  const events = await eventsForShipments(
    database,
    shipments.map((row) => row.id),
  );
  return {
    order: {
      id: order.id,
      externalOrderId: order.externalOrderId,
      status: order.status,
      buyerName: order.buyerName,
      marketplace: store.marketplace,
    },
    items,
    shipments: shipments.map((shipment) => ({
      ...withShipmentDelay(shipment, new Date()),
      events: events.filter((event) => event.shipmentId === shipment.id),
    })),
  };
}

/** Lock the order before grouping items; retries cannot dispatch the same items twice. */
export async function forwardOrder(
  database: Database,
  tenantId: string,
  input: z.infer<typeof forwardOrderSchema> & { actor?: ForwardActor },
) {
  const credit = FORWARD_CREDIT[input.actor ?? "reseller"];
  return database.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.tenantId, tenantId)))
      .for("update");
    if (!order) throw notFoundError("Pedido não encontrado");
    if (order.status !== "paid")
      throw conflictError("Somente pedidos pagos podem ser encaminhados");
    const existing = await tx
      .select({ id: orderShipments.id })
      .from(orderShipments)
      .where(eq(orderShipments.orderId, order.id));
    if (existing.length) throw conflictError("Este pedido já foi encaminhado");
    const grouped = await supplierGroups(tx, tenantId, order.id);
    const links: { shipmentId: string; supplierId: string; token: string }[] = [];
    for (const [supplierId, lines] of grouped) {
      const link = issueSupplierLink();
      const [shipment] = await tx
        .insert(orderShipments)
        .values({
          tenantId,
          orderId: order.id,
          supplierId,
          address: input.address,
          notes: input.notes,
          items: lines.map(({ orderItemId, title, quantity, sku }) => ({
            orderItemId,
            title,
            quantity,
            sku: sku ?? "",
          })),
          supplierTokenHash: link.hash,
          supplierTokenExpiresAt: link.expiresAt,
        })
        .returning({ id: orderShipments.id });
      if (!shipment) throw new Error("Não foi possível encaminhar o pedido");
      await tx.insert(shipmentEvents).values({
        shipmentId: shipment.id,
        status: "forwarded",
        ...credit,
      });
      links.push({ shipmentId: shipment.id, supplierId, token: link.token });
    }
    return links;
  });
}

/**
 * Sends a cancelled parcel to its supplier again: same items and address, a new link (the old
 * one stops working), and a fresh start at "forwarded". The cancellation stays in its history.
 */
export async function reforwardShipment(database: Database, tenantId: string, shipmentId: string) {
  return database.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ orderId: orderShipments.orderId })
      .from(orderShipments)
      .where(and(eq(orderShipments.id, shipmentId), eq(orderShipments.tenantId, tenantId)));
    if (!candidate) throw notFoundError("Envio não encontrado");
    // The order first, like every other fulfillment write.
    const [order] = await tx
      .select({ status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, candidate.orderId), eq(orders.tenantId, tenantId)))
      .for("update");
    if (order?.status !== "paid")
      throw conflictError("Somente pedidos pagos podem ser reencaminhados");
    const link = issueSupplierLink();
    const [shipment] = await tx
      .update(orderShipments)
      .set({
        status: "forwarded",
        supplierTokenHash: link.hash,
        supplierTokenExpiresAt: link.expiresAt,
        updatedAt: new Date(),
      })
      .where(and(eq(orderShipments.id, shipmentId), eq(orderShipments.status, "cancelled")))
      .returning({ id: orderShipments.id, supplierId: orderShipments.supplierId });
    if (!shipment) throw conflictError("Só um envio cancelado pode ser reencaminhado");
    // The same rule as the first forward: a supplier turned off by the admin gets no new parcel.
    const [supplier] = await tx
      .select({ active: suppliers.active })
      .from(suppliers)
      .where(eq(suppliers.id, shipment.supplierId));
    if (!supplier?.active)
      throw conflictError("Este fornecedor foi desativado e não recebe mais pedidos");
    await tx.insert(shipmentEvents).values({
      shipmentId,
      status: "forwarded",
      actor: SHIPMENT_ACTORS.reseller,
      note: "Reencaminhado ao fornecedor. Compartilhe o novo link com ele.",
    });
    return { shipmentId, supplierId: shipment.supplierId, token: link.token };
  });
}

export async function rotateSupplierLink(database: Database, tenantId: string, shipmentId: string) {
  const link = issueSupplierLink();
  const [shipment] = await database
    .update(orderShipments)
    .set({ supplierTokenHash: link.hash, supplierTokenExpiresAt: link.expiresAt })
    .where(
      and(
        eq(orderShipments.id, shipmentId),
        eq(orderShipments.tenantId, tenantId),
        inArray(orderShipments.status, ["forwarded", "accepted", "picking", "ready", "shipped"]),
      ),
    )
    .returning({ id: orderShipments.id });
  if (!shipment) throw notFoundError("Envio não encontrado ou encerrado");
  return { shipmentId, token: link.token };
}

export async function revokeSupplierLink(database: Database, tenantId: string, shipmentId: string) {
  const [shipment] = await database
    .update(orderShipments)
    .set({ supplierTokenHash: null, supplierTokenExpiresAt: null })
    .where(and(eq(orderShipments.id, shipmentId), eq(orderShipments.tenantId, tenantId)))
    .returning({ id: orderShipments.id });
  if (!shipment) throw notFoundError("Envio não encontrado");
}

export async function getSupplierShipment(database: Database, token: string) {
  const [row] = await database
    .select({
      shipment: orderShipments,
      externalOrderId: orders.externalOrderId,
      orderStatus: orders.status,
      marketplace: storeConnections.marketplace,
      supplierName: suppliers.name,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(
        eq(orderShipments.supplierTokenHash, hashToken(token)),
        gt(orderShipments.supplierTokenExpiresAt, new Date()),
      ),
    );
  if (!row) throw notFoundError("Link inválido, expirado ou revogado");
  const {
    supplierTokenHash: _hash,
    supplierTokenExpiresAt: _expiry,
    tenantId: _tenant,
    ...shipment
  } = row.shipment;
  const events = await database
    .select()
    .from(shipmentEvents)
    .where(eq(shipmentEvents.shipmentId, shipment.id))
    .orderBy(asc(shipmentEvents.createdAt));
  // The buyer's address serves the delivery only: once the parcel is settled or the order is
  // cancelled or returned, the link still shows what happened, but no longer where it went.
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
    events,
  };
}

/**
 * History rows one parcel may hold. Steps are few (one per stage), but occurrences can be posted
 * again and again through a supplier link that anyone holding it can call: without a ceiling, a
 * script could bloat the history every page of the order loads in full.
 */
export const MAX_SHIPMENT_EVENTS = 100;

async function assertRoomForNote(tx: Transaction, shipmentId: string) {
  const [row] = await tx
    .select({ events: count() })
    .from(shipmentEvents)
    .where(eq(shipmentEvents.shipmentId, shipmentId));
  if ((row?.events ?? 0) >= MAX_SHIPMENT_EVENTS) {
    throw conflictError(
      `Este envio já tem ${MAX_SHIPMENT_EVENTS} registros no histórico, o máximo de ocorrências.`,
    );
  }
}

async function writeShipmentStatus(
  tx: Transaction,
  shipment: typeof orderShipments.$inferSelect,
  input: z.infer<typeof shipmentUpdateSchema>,
  by: ShipmentOperator,
) {
  // A delivery the supplier declares about itself is not proof: it releases the reseller's review
  // and, later, the supplier's payment. Only the marketplace or the reseller confirms it.
  if (by === "supplier" && input.status === "delivered") throw conflictError(DELIVERY_CONFIRMED_BY);
  if (
    input.status !== shipment.status &&
    FULFILLMENT_NEXT[shipment.status] !== input.status &&
    !(
      input.status === "cancelled" &&
      !DISPATCHED_FULFILLMENT_STATUSES.includes(shipment.status) &&
      shipment.status !== "cancelled"
    )
  ) {
    throw conflictError(
      "Etapa inválida. Atualize o pedido e siga a sequência de preparação e envio.",
    );
  }
  if (SETTLED_FULFILLMENT_STATUSES.includes(shipment.status))
    throw conflictError("Este envio já foi encerrado");
  if (input.status === shipment.status && !input.note)
    throw conflictError("Informe uma ocorrência ou avance a etapa");
  if (input.status === shipment.status) await assertRoomForNote(tx, shipment.id);
  const shipsNow = input.status === "shipped" && shipment.status !== "shipped";
  if (shipsNow && (!input.carrier || !input.trackingCode))
    throw validationError("Informe transportadora e código de rastreio");
  await tx
    .update(orderShipments)
    .set({
      status: input.status,
      updatedAt: new Date(),
      ...linkFieldsFor(input.status),
      // Written when the parcel ships, or when an occurrence brings them; never blanked.
      ...(shipsNow || (input.status === "shipped" && input.carrier && input.trackingCode)
        ? {
            carrier: input.carrier,
            trackingCode: input.trackingCode,
            trackingUrl: input.trackingUrl || null,
          }
        : {}),
    })
    .where(eq(orderShipments.id, shipment.id));
  await tx.insert(shipmentEvents).values({
    shipmentId: shipment.id,
    status: input.status,
    actor: SHIPMENT_ACTORS[by],
    note: input.note,
  });
}

/** Parcels the supplier has nothing more to do or see for. */
const LINK_CLOSING_STATUSES: readonly FulfillmentStatus[] = ["delivered", "returned"];

/**
 * A delivered or returned parcel needs nothing more from the supplier: its link stops working
 * instead of showing the buyer's address and label for the rest of its 30 days. A cancelled one
 * keeps it, so the supplier still sees the cancellation it made; re-forwarding replaces it.
 */
function linkFieldsFor(status: FulfillmentStatus) {
  return LINK_CLOSING_STATUSES.includes(status)
    ? { supplierTokenHash: null, supplierTokenExpiresAt: null }
    : {};
}

/** All writes lock the parent order first, so separate supplier parcels cannot race. */
export async function updateShipment(
  database: Database,
  input: z.infer<typeof shipmentUpdateSchema>,
  access: { tenantId: string } | { token: string },
) {
  return database.transaction(async (tx) => {
    const accessFilter =
      "tenantId" in access
        ? eq(orderShipments.tenantId, access.tenantId)
        : and(
            eq(orderShipments.supplierTokenHash, hashToken(access.token)),
            gt(orderShipments.supplierTokenExpiresAt, new Date()),
          );
    const [candidate] = await tx
      .select()
      .from(orderShipments)
      .where(and(eq(orderShipments.id, input.shipmentId), accessFilter));
    if (!candidate) throw notFoundError("Envio não encontrado");
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, candidate.orderId), eq(orders.tenantId, candidate.tenantId)))
      .for("update");
    if (!order) throw notFoundError("Pedido não encontrado");
    if (["cancelled", "returned", "pending"].includes(order.status) && input.status !== "cancelled")
      throw conflictError("O pedido não está liberado para envio");
    const [shipment] = await tx
      .select()
      .from(orderShipments)
      .where(and(eq(orderShipments.id, candidate.id), accessFilter))
      .for("update");
    if (!shipment) throw notFoundError("Link revogado ou expirado");
    await writeShipmentStatus(tx, shipment, input, "tenantId" in access ? "reseller" : "supplier");
    await syncOrderFromShipments(tx, order);
    // An occurrence note keeps the step: nothing moved, so no stock to push.
    return { statusChanged: input.status !== shipment.status };
  });
}

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
  return database.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
      .for("update");
    if (!order) throw notFoundError("Pedido não encontrado");
    if (order.status === "cancelled") throw conflictError("Pedido cancelado");
    // Settled: a later reading (the return seen again, a lagging "shipped") changes nothing.
    if (order.status === "returned") return { changed: false };
    const shipments = await tx
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
    await tx
      .update(orderShipments)
      .set({ status, ...trackedValues(shipping, shipment), ...linkFieldsFor(status) })
      .where(eq(orderShipments.id, shipment.id));
    const newTrackingCode =
      shipping.trackingCode && shipping.trackingCode !== shipment.trackingCode
        ? shipping.trackingCode
        : null;
    if (status !== shipment.status || newTrackingCode)
      await tx.insert(shipmentEvents).values({
        shipmentId: shipment.id,
        status,
        actor: SHIPMENT_ACTORS.marketplace,
        // The status label says what happened; the note only adds a tracking code that just arrived.
        note: newTrackingCode ? `Código de rastreio ${newTrackingCode}` : "",
      });
    await syncOrderFromShipments(tx, order, { buyerReturned: shipping.buyerReturnDelivered });
    return { changed: status !== shipment.status || newTrackingCode !== null };
  });
}
