import { createFulfillmentParcels } from "./create-fulfillment-parcels.ts";
import { syncOrderFromShipments } from "./fulfillment-status.ts";
import { linkFieldsFor } from "./shipment-link-fields.ts";
import * as timing from "./shipment-timing.ts";
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
  lt,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { conflictError, notFoundError, validationError } from "@sellbridge/shared/errors";
import {
  DISPATCHED_FULFILLMENT_STATUSES,
  DELIVERY_CONFIRMED_BY,
  FULFILLMENT_NEXT,
  type forwardOrderSchema,
  SETTLED_FULFILLMENT_STATUSES,
  SHIPMENT_ACTORS,
  type ShipmentOperator,
  type operationsSearchSchema,
  type shipmentUpdateSchema,
  SHIPMENT_EVENTS_FULL,
  SHIPMENT_EVENTS_LIMIT,
  trackingCodeCorrectionNote,
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
import { type ForwardActor, supplierGroups } from "./supplier-groups.ts";
import { hashSupplierToken, issueSupplierLink } from "./supplier-link.ts";

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
          supplierName: suppliers.name,
          catalogKind: suppliers.catalogKind,
          trackingCode: orderShipments.trackingCode,
          ...timing.shipmentTimingColumns,
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
        .map((shipment) => timing.withShipmentDelay(shipment, now)),
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
      catalogKind: suppliers.catalogKind,
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
      catalogKind: suppliers.catalogKind,
      address: orderShipments.address,
      items: orderShipments.items,
      notes: orderShipments.notes,
      carrier: orderShipments.carrier,
      trackingCode: orderShipments.trackingCode,
      trackingUrl: orderShipments.trackingUrl,
      trackedAt: orderShipments.trackedAt,
      ...timing.shipmentTimingColumns,
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
      /** Encrypted; the web app opens it for the forward form only (never sent as is). */
      shippingAddressEnc: order.shippingAddressEnc,
    },
    items,
    shipments: shipments.map((shipment) => ({
      ...timing.withShipmentDelay(shipment, new Date()),
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
  return database.transaction(async (transaction) => {
    const [order] = await transaction
      .select()
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.tenantId, tenantId)))
      .for("update");
    if (!order) throw notFoundError("Pedido não encontrado");
    if (order.status !== "paid")
      throw conflictError("Somente pedidos pagos podem ser encaminhados");
    const existing = await transaction
      .select({ id: orderShipments.id })
      .from(orderShipments)
      .where(eq(orderShipments.orderId, order.id));
    if (existing.length) throw conflictError("Este pedido já foi encaminhado");
    const grouped = await supplierGroups(transaction, tenantId, order.id);
    return createFulfillmentParcels(
      {
        transaction,
        tenantId,
        orderId: order.id,
        address: input.address,
        notes: input.notes,
        actor: input.actor ?? "reseller",
      },
      grouped,
    );
  });
}

/**
 * Sends a cancelled parcel to its supplier again: same items and address, a new link (the old
 * one stops working), and a fresh start at "forwarded". The cancellation stays in its history.
 */
export async function reforwardShipment(database: Database, tenantId: string, shipmentId: string) {
  return database.transaction(async (transaction) => {
    const [candidate] = await transaction
      .select({ orderId: orderShipments.orderId })
      .from(orderShipments)
      .where(
        and(
          eq(orderShipments.id, shipmentId),
          eq(orderShipments.tenantId, tenantId),
          publicShipmentSource(),
        ),
      );
    if (!candidate) throw notFoundError("Envio não encontrado");
    // The order first, like every other fulfillment write.
    const [order] = await transaction
      .select({ status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, candidate.orderId), eq(orders.tenantId, tenantId)))
      .for("update");
    if (order?.status !== "paid")
      throw conflictError("Somente pedidos pagos podem ser reencaminhados");
    const link = issueSupplierLink();
    const [shipment] = await transaction
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
    const [supplier] = await transaction
      .select({ active: suppliers.active })
      .from(suppliers)
      .where(eq(suppliers.id, shipment.supplierId));
    if (!supplier?.active)
      throw conflictError("Este fornecedor foi desativado e não recebe mais pedidos");
    await transaction.insert(shipmentEvents).values({
      shipmentId,
      status: "forwarded",
      actor: SHIPMENT_ACTORS.reseller,
      note: "Reencaminhado ao fornecedor. Compartilhe o novo link com ele.",
    });
    return { shipmentId, supplierId: shipment.supplierId, token: link.token };
  });
}

function publicShipmentSource() {
  return sql`exists (select 1 from ${suppliers} where ${suppliers.id} = ${orderShipments.supplierId}
    and ${suppliers.catalogKind} = 'supplier')`;
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
        publicShipmentSource(),
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
      catalogKind: suppliers.catalogKind,
      ...timing.supplierTimingColumns,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(
        publicShipmentSource(),
        eq(orderShipments.supplierTokenHash, hashSupplierToken(token)),
        gt(orderShipments.supplierTokenExpiresAt, new Date()),
      ),
    );
  if (!row) throw notFoundError("Link inválido, expirado ou revogado");
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
    ...timing.supplierDeadlines(shipment, row),
    events,
  };
}

/**
 * History rows one parcel may hold. Steps are few (one per stage), but occurrences can be posted
 * again and again through a supplier link that anyone holding it can call: without a ceiling, a
 * script could bloat the history every page of the order loads in full.
 */
export const MAX_SHIPMENT_EVENTS = SHIPMENT_EVENTS_LIMIT;

async function assertRoomForNote(transaction: Transaction, shipmentId: string) {
  const [row] = await transaction
    .select({ events: count() })
    .from(shipmentEvents)
    .where(eq(shipmentEvents.shipmentId, shipmentId));
  if ((row?.events ?? 0) >= MAX_SHIPMENT_EVENTS) {
    throw conflictError(SHIPMENT_EVENTS_FULL);
  }
}

async function writeShipmentStatus(
  transaction: Transaction,
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
  const correctsCode = correctsTrackingCode(shipment, input);
  if (input.status === shipment.status && !input.note && !correctsCode)
    throw conflictError("Informe uma ocorrência ou avance a etapa");
  if (input.status === shipment.status) await assertRoomForNote(transaction, shipment.id);
  const shipsNow = input.status === "shipped" && shipment.status !== "shipped";
  if (shipsNow && (!input.carrier || !input.trackingCode))
    throw validationError("Informe transportadora e código de rastreio");
  await transaction
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
  await transaction.insert(shipmentEvents).values({
    shipmentId: shipment.id,
    status: input.status,
    actor: SHIPMENT_ACTORS[by],
    // The old code goes into the history: whoever copied it before must know it changed.
    note:
      correctsCode && shipment.trackingCode !== null
        ? trackingCodeCorrectionNote(shipment.trackingCode, input.trackingCode, input.note)
        : input.note,
  });
}

/** A sent parcel whose carrier and code come again with a different code: a correction. */
function correctsTrackingCode(
  shipment: typeof orderShipments.$inferSelect,
  input: z.infer<typeof shipmentUpdateSchema>,
): boolean {
  return (
    shipment.status === "shipped" &&
    input.status === "shipped" &&
    input.carrier !== "" &&
    input.trackingCode !== "" &&
    shipment.trackingCode !== null &&
    shipment.trackingCode !== input.trackingCode
  );
}

/**
 * Who may write a shipment: the reseller (its tenant), the supplier by its link token, or the
 * supplier signed in to its panel (its id). Only the tenant writes as the reseller.
 */
export type ShipmentAccess = { tenantId: string } | { token: string } | { supplierId: string };

function shipmentAccessFilter(access: ShipmentAccess) {
  if ("tenantId" in access) {
    return eq(orderShipments.tenantId, access.tenantId);
  }
  if ("supplierId" in access) {
    return and(eq(orderShipments.supplierId, access.supplierId), publicShipmentSource());
  }
  return and(
    publicShipmentSource(),
    eq(orderShipments.supplierTokenHash, hashSupplierToken(access.token)),
    gt(orderShipments.supplierTokenExpiresAt, new Date()),
  );
}

/** All writes lock the parent order first, so separate supplier parcels cannot race. */
export async function updateShipment(
  database: Database,
  input: z.infer<typeof shipmentUpdateSchema>,
  access: ShipmentAccess,
) {
  return database.transaction(async (transaction) => {
    const accessFilter = shipmentAccessFilter(access);
    const [candidate] = await transaction
      .select()
      .from(orderShipments)
      .where(and(eq(orderShipments.id, input.shipmentId), accessFilter));
    if (!candidate) throw notFoundError("Envio não encontrado");
    const [order] = await transaction
      .select()
      .from(orders)
      .where(and(eq(orders.id, candidate.orderId), eq(orders.tenantId, candidate.tenantId)))
      .for("update");
    if (!order) throw notFoundError("Pedido não encontrado");
    if (["cancelled", "returned", "pending"].includes(order.status) && input.status !== "cancelled")
      throw conflictError("O pedido não está liberado para envio");
    const [shipment] = await transaction
      .select()
      .from(orderShipments)
      .where(and(eq(orderShipments.id, candidate.id), accessFilter))
      .for("update");
    if (!shipment) throw notFoundError("Link revogado ou expirado");
    await writeShipmentStatus(
      transaction,
      shipment,
      input,
      "tenantId" in access ? "reseller" : "supplier",
    );
    await syncOrderFromShipments(transaction, order);
    // An occurrence note keeps the step: nothing moved, so no stock to push.
    return { statusChanged: input.status !== shipment.status };
  });
}

export {
  applyMarketplaceShipment,
  listShipmentsToTrack,
  touchShipmentTracking,
} from "./marketplace-shipment-tracking.ts";
