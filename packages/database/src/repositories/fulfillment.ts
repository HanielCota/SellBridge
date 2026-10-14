import { syncOrderFromShipments } from "./fulfillment-status.ts";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, exists, gt, ilike, inArray, notExists, or, sql } from "drizzle-orm";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import {
  DISPATCHED_FULFILLMENT_STATUSES,
  FULFILLMENT_NEXT,
  type FulfillmentStatus,
  type forwardOrderSchema,
  type MarketplaceTrackingStatus,
  SETTLED_FULFILLMENT_STATUSES,
  type operationsSearchSchema,
  type shipmentUpdateSchema,
} from "@sellbridge/shared/schemas";
import type { z } from "zod";
import type { Database } from "../client.ts";
import {
  orderItems,
  orders,
  orderShipments,
  shipmentEvents,
  storeConnections,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const tokenExpiry = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function operationalFilter(
  database: Database,
  tenantId: string,
  search: z.infer<typeof operationsSearchSchema>,
) {
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
  const term = `%${search.query.replace(/[\\%_]/g, "\\$&")}%`;
  return and(
    eq(orders.tenantId, tenantId),
    stageFilter,
    search.query
      ? or(ilike(orders.externalOrderId, term), ilike(orders.buyerName, term))
      : undefined,
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
        })
        .from(orderShipments)
        .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
        .where(and(eq(orderShipments.tenantId, tenantId), inArray(orderShipments.orderId, ids)))
    : [];
}

export async function listOperationalOrders(
  database: Database,
  tenantId: string,
  search: z.infer<typeof operationsSearchSchema>,
) {
  const filter = operationalFilter(database, tenantId, search);
  const [rows, totals] = await Promise.all([
    database
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
      .limit(20)
      .offset((search.page - 1) * 20),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .where(filter),
  ]);
  const shipments = await operationalShipments(
    database,
    tenantId,
    rows.map((row) => row.id),
  );
  const total = totals[0]?.total ?? 0;
  return {
    items: rows.map((row) => ({
      ...row,
      shipments: shipments.filter((shipment) => shipment.orderId === row.id),
    })),
    page: search.page,
    total,
    totalPages: Math.ceil(total / 20),
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

export async function getFulfillmentDetail(database: Database, tenantId: string, orderId: string) {
  const [order] = await database
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));
  if (!order) throw notFoundError("Pedido não encontrado");
  const [items, shipments, stores] = await Promise.all([
    fulfillmentItems(database, tenantId, orderId),
    database
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
        updatedAt: orderShipments.updatedAt,
        supplierTokenExpiresAt: orderShipments.supplierTokenExpiresAt,
      })
      .from(orderShipments)
      .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
      .where(and(eq(orderShipments.orderId, orderId), eq(orderShipments.tenantId, tenantId)))
      .orderBy(asc(orderShipments.createdAt)),
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
      marketplace: stores[0]?.marketplace ?? "mock",
    },
    items,
    shipments: shipments.map((shipment) => ({
      ...shipment,
      events: events.filter((event) => event.shipmentId === shipment.id),
    })),
  };
}

async function supplierGroups(tx: Transaction, tenantId: string, orderId: string) {
  const items = await tx
    .select({
      orderItemId: orderItems.id,
      title: orderItems.title,
      quantity: orderItems.quantity,
      sku: supplierProducts.sku,
      supplierId: supplierProducts.supplierId,
      active: suppliers.active,
    })
    .from(orderItems)
    .leftJoin(supplierProducts, eq(supplierProducts.id, orderItems.supplierProductId))
    .leftJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.tenantId, tenantId)));
  if (!items.length || items.some((item) => !item.supplierId || !item.active))
    throw conflictError("Vincule todos os itens a fornecedores ativos antes de encaminhar");
  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const supplierId = item.supplierId;
    if (!supplierId) throw conflictError("Item sem fornecedor");
    grouped.set(supplierId, [...(grouped.get(supplierId) ?? []), item]);
  }
  return grouped;
}

/** Lock the order before grouping items; retries cannot dispatch the same items twice. */
export async function forwardOrder(
  database: Database,
  tenantId: string,
  input: z.infer<typeof forwardOrderSchema>,
) {
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
      const token = randomBytes(32).toString("hex");
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
          supplierTokenHash: hashToken(token),
          supplierTokenExpiresAt: tokenExpiry(),
        })
        .returning({ id: orderShipments.id });
      if (!shipment) throw new Error("Não foi possível encaminhar o pedido");
      await tx.insert(shipmentEvents).values({
        shipmentId: shipment.id,
        status: "forwarded",
        actor: "Revendedor",
        note: "Ordem de fornecimento criada. Compartilhe o link com o fornecedor.",
      });
      links.push({ shipmentId: shipment.id, supplierId, token });
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
    const token = randomBytes(32).toString("hex");
    const [shipment] = await tx
      .update(orderShipments)
      .set({
        status: "forwarded",
        supplierTokenHash: hashToken(token),
        supplierTokenExpiresAt: tokenExpiry(),
        updatedAt: new Date(),
      })
      .where(and(eq(orderShipments.id, shipmentId), eq(orderShipments.status, "cancelled")))
      .returning({ id: orderShipments.id, supplierId: orderShipments.supplierId });
    if (!shipment) throw conflictError("Só um envio cancelado pode ser reencaminhado");
    await tx.insert(shipmentEvents).values({
      shipmentId,
      status: "forwarded",
      actor: "Revendedor",
      note: "Reencaminhado ao fornecedor. Compartilhe o novo link com ele.",
    });
    return { shipmentId, supplierId: shipment.supplierId, token };
  });
}

export async function rotateSupplierLink(database: Database, tenantId: string, shipmentId: string) {
  const token = randomBytes(32).toString("hex");
  const [shipment] = await database
    .update(orderShipments)
    .set({ supplierTokenHash: hashToken(token), supplierTokenExpiresAt: tokenExpiry() })
    .where(
      and(
        eq(orderShipments.id, shipmentId),
        eq(orderShipments.tenantId, tenantId),
        inArray(orderShipments.status, ["forwarded", "accepted", "picking", "ready", "shipped"]),
      ),
    )
    .returning({ id: orderShipments.id });
  if (!shipment) throw notFoundError("Envio não encontrado ou encerrado");
  return { shipmentId, token };
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
  return {
    ...shipment,
    externalOrderId: row.externalOrderId,
    orderStatus: row.orderStatus,
    marketplace: row.marketplace,
    supplierName: row.supplierName,
    events,
  };
}

async function writeShipmentStatus(
  tx: Transaction,
  shipment: typeof orderShipments.$inferSelect,
  input: z.infer<typeof shipmentUpdateSchema>,
  actor: string,
) {
  // A delivery the supplier declares about itself is not proof: it releases the reseller's review
  // and, later, the supplier's payment. Only the marketplace or the reseller confirms it.
  if (actor === "Fornecedor" && input.status === "delivered" && shipment.status !== "delivered")
    throw conflictError("A entrega é confirmada pelo marketplace ou pelo revendedor.");
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
  await tx
    .update(orderShipments)
    .set({
      status: input.status,
      updatedAt: new Date(),
      ...(input.status === "shipped"
        ? {
            carrier: input.carrier,
            trackingCode: input.trackingCode,
            trackingUrl: input.trackingUrl || null,
          }
        : {}),
    })
    .where(eq(orderShipments.id, shipment.id));
  await tx
    .insert(shipmentEvents)
    .values({ shipmentId: shipment.id, status: input.status, actor, note: input.note });
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
    await writeShipmentStatus(
      tx,
      shipment,
      input,
      "tenantId" in access ? "Revendedor" : "Fornecedor",
    );
    await syncOrderFromShipments(tx, order);
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
    if (order.status === "returned") return;
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
      .set({
        status,
        carrier: shipping.carrier ?? shipment.carrier,
        trackingCode: shipping.trackingCode ?? shipment.trackingCode,
        updatedAt: new Date(),
      })
      .where(eq(orderShipments.id, shipment.id));
    const newTrackingCode =
      shipping.trackingCode && shipping.trackingCode !== shipment.trackingCode
        ? shipping.trackingCode
        : null;
    if (status !== shipment.status || newTrackingCode)
      await tx.insert(shipmentEvents).values({
        shipmentId: shipment.id,
        status,
        actor: "Mercado Livre",
        // The status label says what happened; the note only adds a tracking code that just arrived.
        note: newTrackingCode ? `Código de rastreio ${newTrackingCode}` : "",
      });
    await syncOrderFromShipments(tx, order, { buyerReturned: shipping.buyerReturnDelivered });
  });
}
