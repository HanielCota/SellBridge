import { logger } from "@sellbridge/shared/logger";
import { returnClaimSubject } from "@sellbridge/shared/return-claims";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import {
  member,
  orderItems,
  orderShipments,
  returnClaims,
  suppliers,
  ticketOrders,
  tickets,
  type ShipmentItem,
} from "../schema/index.ts";

/** The order a claim is opened for: the fields the claim and its ticket need. */
export interface ReturnedOrder {
  id: string;
  tenantId: string;
  externalOrderId: string;
}

interface ReturnedParcel {
  id: string;
  supplierId: string;
  /** The supplier's own profile; null when the team still runs the catalog for it. */
  supplierOrganizationId: string | null;
  items: ShipmentItem[];
}

/** The supplier parcels of an order that came back: cancelled ones and own stock have no claim. */
async function findReturnedParcels(
  executor: DatabaseExecutor,
  order: ReturnedOrder,
): Promise<ReturnedParcel[]> {
  return executor
    .select({
      id: orderShipments.id,
      supplierId: orderShipments.supplierId,
      supplierOrganizationId: suppliers.organizationId,
      items: orderShipments.items,
    })
    .from(orderShipments)
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(
        eq(orderShipments.orderId, order.id),
        eq(orderShipments.tenantId, order.tenantId),
        ne(orderShipments.status, "cancelled"),
        eq(suppliers.catalogKind, "supplier"),
      ),
    );
}

/** What the reseller paid the supplier for the parcel's items: unit cost times quantity. */
async function parcelSupplierCost(
  executor: DatabaseExecutor,
  order: ReturnedOrder,
  items: readonly ShipmentItem[],
): Promise<number> {
  const itemIds = items.map((item) => item.orderItemId);
  if (itemIds.length === 0) {
    return 0;
  }
  const rows = await executor
    .select({ id: orderItems.id, unitCostCents: orderItems.unitCostCents })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, order.id),
        eq(orderItems.tenantId, order.tenantId),
        inArray(orderItems.id, itemIds),
      ),
    );
  const unitCosts = new Map(rows.map((row) => [row.id, row.unitCostCents]));
  return items.reduce(
    (total, item) => total + (unitCosts.get(item.orderItemId) ?? 0) * item.quantity,
    0,
  );
}

/** Whoever speaks for a profile on a ticket: its owner, or its oldest member without one. */
async function findProfileRequester(
  executor: DatabaseExecutor,
  organizationId: string,
): Promise<string | null> {
  const [row] = await executor
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, organizationId))
    .orderBy(desc(sql`${member.role} = 'owner'`), asc(member.createdAt))
    .limit(1);
  return row?.userId ?? null;
}

/**
 * The claim's ticket. It belongs to the supplier's profile, so the supplier answers it from its
 * own support area and never sees who the reseller is. A supplier the team still runs has no
 * profile: the ticket then belongs to the reseller, with the order linked, and the team answers
 * for the supplier. It opens without a message: the claim card on the ticket says what happened.
 */
async function openClaimTicket(
  executor: DatabaseExecutor,
  order: ReturnedOrder,
  parcel: ReturnedParcel,
  now: Date,
): Promise<string | null> {
  const tenantId = parcel.supplierOrganizationId ?? order.tenantId;
  const requesterId = await findProfileRequester(executor, tenantId);
  if (requesterId === null) {
    return null;
  }
  const [ticket] = await executor
    .insert(tickets)
    .values({
      tenantId,
      createdById: requesterId,
      category: "order",
      priority: "normal",
      subject: returnClaimSubject(order.externalOrderId),
      awaitingSince: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: tickets.id });
  if (ticket === undefined) {
    return null;
  }
  if (tenantId === order.tenantId) {
    await executor.insert(ticketOrders).values({ ticketId: ticket.id, orderId: order.id });
  }
  return ticket.id;
}

async function openParcelClaim(
  executor: DatabaseExecutor,
  order: ReturnedOrder,
  parcel: ReturnedParcel,
  now: Date,
): Promise<void> {
  const supplierCostCents = await parcelSupplierCost(executor, order, parcel.items);
  const [claim] = await executor
    .insert(returnClaims)
    .values({
      shipmentId: parcel.id,
      orderId: order.id,
      sellerTenantId: order.tenantId,
      supplierId: parcel.supplierId,
      supplierCostCents,
      createdAt: now,
    })
    .onConflictDoNothing({ target: returnClaims.shipmentId })
    .returning({ id: returnClaims.id });
  // Already opened by an earlier run of the same return: nothing more to do.
  if (claim === undefined) {
    return;
  }
  const ticketId = await openClaimTicket(executor, order, parcel, now);
  if (ticketId === null) {
    logger.warn("return_claims.ticket_without_requester", {
      claimId: claim.id,
      supplierId: parcel.supplierId,
    });
    return;
  }
  await executor.update(returnClaims).set({ ticketId }).where(eq(returnClaims.id, claim.id));
  logger.info("return_claims.opened", { claimId: claim.id, ticketId, orderId: order.id });
}

/**
 * Opens a claim with each supplier of an order that came back: one per parcel, however many
 * times the return is read again. Runs inside the transaction that marks the order returned, so
 * a failed claim rolls the return back and the next tracking run tries both again.
 */
export async function openReturnClaims(
  executor: DatabaseExecutor,
  order: ReturnedOrder,
  now: Date = new Date(),
): Promise<void> {
  const parcels = await findReturnedParcels(executor, order);
  for (const parcel of parcels) {
    await openParcelClaim(executor, order, parcel, now);
  }
}
