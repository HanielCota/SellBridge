import { SHIPMENT_ACTORS } from "@sellbridge/shared/schemas";
import type { SupplierRecipient } from "@sellbridge/shared/supplier-order-email";
import { and, eq, inArray } from "drizzle-orm";
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

/** Why a paid order stays with the reseller instead of being forwarded on its own. */
export type AutoForwardBlocker =
  "not_paid" | "already_forwarded" | "unlinked_items" | "missing_supplier_email";

export interface AutoForwardCandidate {
  orderId: string;
  tenantId: string;
  externalOrderId: string;
  store: typeof storeConnections.$inferSelect;
  /** Null when the order can go: paid, not forwarded, every item with a supplier that has e-mail. */
  blocker: AutoForwardBlocker | null;
}

/**
 * Every item needs an active supplier (the forward refuses otherwise), and every supplier an
 * order e-mail: forwarding on its own to a supplier nobody tells would leave the parcel waiting
 * while the reseller believes it is on its way.
 */
async function itemsBlocker(
  database: Database,
  orderId: string,
): Promise<AutoForwardBlocker | null> {
  const items = await database
    .select({ active: suppliers.active, contactEmail: suppliers.contactEmail })
    .from(orderItems)
    .leftJoin(supplierProducts, eq(supplierProducts.id, orderItems.supplierProductId))
    .leftJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(eq(orderItems.orderId, orderId));
  if (items.length === 0 || items.some((item) => item.active !== true)) {
    return "unlinked_items";
  }
  if (items.some((item) => item.contactEmail === null)) {
    return "missing_supplier_email";
  }
  return null;
}

async function isForwarded(database: Database, orderId: string): Promise<boolean> {
  const [shipment] = await database
    .select({ id: orderShipments.id })
    .from(orderShipments)
    .where(eq(orderShipments.orderId, orderId))
    .limit(1);
  return shipment !== undefined;
}

async function blockerOf(
  database: Database,
  order: { id: string; status: string },
): Promise<AutoForwardBlocker | null> {
  if (order.status !== "paid") {
    return "not_paid";
  }
  if (await isForwarded(database, order.id)) {
    return "already_forwarded";
  }
  return itemsBlocker(database, order.id);
}

/**
 * The order the worker was asked to forward, with its store and whether it may go now. Read
 * outside the forward's transaction: `forwardOrder` checks paid and not-forwarded again under
 * the order's lock, so a race only ends in its "already forwarded" conflict.
 */
export async function autoForwardCandidate(
  database: Database,
  orderId: string,
): Promise<AutoForwardCandidate | null> {
  const [row] = await database
    .select({ order: orders, store: storeConnections })
    .from(orders)
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .where(eq(orders.id, orderId));
  if (row === undefined) {
    return null;
  }
  return {
    orderId: row.order.id,
    tenantId: row.order.tenantId,
    externalOrderId: row.order.externalOrderId,
    store: row.store,
    blocker: await blockerOf(database, row.order),
  };
}

/**
 * What the supplier e-mail of each parcel needs: its supplier's order e-mail (null when it has
 * none) and deadlines, the order number and the parcel's items. Only the tenant's own parcels.
 */
export async function forwardRecipients(
  database: Database,
  tenantId: string,
  shipmentIds: readonly string[],
): Promise<SupplierRecipient[]> {
  if (shipmentIds.length === 0) {
    return [];
  }
  const rows = await database
    .select({
      shipmentId: orderShipments.id,
      items: orderShipments.items,
      externalOrderId: orders.externalOrderId,
      contactEmail: suppliers.contactEmail,
      acceptWithinHours: suppliers.acceptWithinHours,
      dispatchWithinHours: suppliers.dispatchWithinHours,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(eq(orderShipments.tenantId, tenantId), inArray(orderShipments.id, [...shipmentIds])),
    );
  return rows.map((row) => ({
    ...row,
    items: row.items.map(({ title, sku, quantity }) => ({ title, sku, quantity })),
  }));
}

/** What the reseller reads in the parcel's history when its supplier e-mail did not go out. */
const SUPPLIER_EMAIL_FAILED_NOTE =
  "O e-mail ao fornecedor não foi enviado. Gere um novo link e envie a ele.";

/**
 * Notes in the parcel's history that its supplier was not told: the forward stands, and the
 * reseller sees why the supplier may not have the order. A parcel of another tenant is left alone.
 */
export async function noteSupplierEmailFailed(
  database: Database,
  tenantId: string,
  shipmentId: string,
): Promise<void> {
  const [shipment] = await database
    .select({ status: orderShipments.status })
    .from(orderShipments)
    .where(and(eq(orderShipments.id, shipmentId), eq(orderShipments.tenantId, tenantId)));
  if (shipment === undefined) {
    return;
  }
  await database.insert(shipmentEvents).values({
    shipmentId,
    status: shipment.status,
    actor: SHIPMENT_ACTORS.sellbridge,
    note: SUPPLIER_EMAIL_FAILED_NOTE,
  });
}
