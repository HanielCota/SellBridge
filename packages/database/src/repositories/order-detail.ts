import { notFoundError } from "@sellbridge/shared/errors";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  listingTargets,
  orderAdjustments,
  orderItems,
  orders,
  storeConnections,
} from "../schema/index.ts";
import type { Marketplace } from "./stores.ts";

type OrderStatus = (typeof orders.$inferSelect)["status"];
type OrderAdjustmentType = (typeof orderAdjustments.$inferSelect)["type"];

export interface OrderDetailItem {
  id: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
  /** Our listing that sold it; null when the item was not linked to one. */
  listingId: string | null;
  productId: string | null;
}

export interface OrderDetailAdjustment {
  id: string;
  type: OrderAdjustmentType;
  amountCents: number;
  reason: string | null;
  createdAt: Date;
}

/** One order as stored, with everything needed to compute its finances. */
export interface OrderDetail {
  id: string;
  externalOrderId: string;
  storeConnectionId: string;
  storeName: string;
  marketplace: Marketplace;
  status: OrderStatus;
  totalCents: number;
  marketplaceFeeCents: number;
  buyerName: string | null;
  orderedAt: Date;
  deliveredAt: Date | null;
  items: OrderDetailItem[];
  adjustments: OrderDetailAdjustment[];
}

async function selectOrder(database: Database, tenantId: string, orderId: string) {
  const [row] = await database
    .select({
      id: orders.id,
      externalOrderId: orders.externalOrderId,
      storeConnectionId: orders.storeConnectionId,
      storeName: storeConnections.shopName,
      marketplace: storeConnections.marketplace,
      status: orders.status,
      totalCents: orders.totalCents,
      marketplaceFeeCents: orders.marketplaceFeeCents,
      buyerName: orders.buyerName,
      orderedAt: orders.orderedAt,
      deliveredAt: orders.deliveredAt,
    })
    .from(orders)
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
    .limit(1);
  return row ?? null;
}

async function selectItems(database: Database, tenantId: string, orderId: string) {
  return database
    .select({
      id: orderItems.id,
      title: orderItems.title,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCents,
      unitCostCents: orderItems.unitCostCents,
      listingId: listingTargets.listingId,
      productId: orderItems.supplierProductId,
    })
    .from(orderItems)
    .leftJoin(listingTargets, eq(listingTargets.id, orderItems.listingTargetId))
    .where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, orderId)))
    .orderBy(asc(orderItems.title), asc(orderItems.id));
}

async function selectAdjustments(database: Database, tenantId: string, orderId: string) {
  return database
    .select({
      id: orderAdjustments.id,
      type: orderAdjustments.type,
      amountCents: orderAdjustments.amountCents,
      reason: orderAdjustments.reason,
      createdAt: orderAdjustments.createdAt,
    })
    .from(orderAdjustments)
    .where(and(eq(orderAdjustments.tenantId, tenantId), eq(orderAdjustments.orderId, orderId)))
    .orderBy(asc(orderAdjustments.createdAt), asc(orderAdjustments.id));
}

/** One order of the tenant with its items and adjustments; not found for any other tenant. */
export async function getOrderDetail(
  database: Database,
  tenantId: string,
  orderId: string,
): Promise<OrderDetail> {
  const order = await selectOrder(database, tenantId, orderId);
  if (!order) {
    throw notFoundError("Pedido não encontrado");
  }
  const [items, adjustments] = await Promise.all([
    selectItems(database, tenantId, orderId),
    selectAdjustments(database, tenantId, orderId),
  ]);
  return { ...order, items, adjustments };
}
