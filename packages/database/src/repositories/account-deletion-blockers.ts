import {
  and,
  count,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  orderShipments,
  orderStatusChanges,
  orders,
  returnClaims,
  shipmentPayments,
  suppliers,
} from "../schema/index.ts";

/**
 * An order or parcel that has not moved for this long no longer blocks a deletion: a store
 * disconnected for good never updates its orders again, and would hold the account forever.
 * Money and open returns block regardless of age (decided 19/11/2026).
 */
const STALE_AFTER_DAYS = 60;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

/** Money still held for parcels, summed for one side of the sale. */
export interface HeldMoney {
  count: number;
  amountCents: number;
  /** The latest date Asaas frees the money on its own; null when none has one yet. */
  lastReleaseAt: Date | null;
  /** Held payments with no release date yet: freed 7 days after the delivery. */
  awaitingDelivery: number;
}

/** What still keeps the workspaces from being deleted; all zero when nothing does. */
export interface DeletionBlockers {
  /** Seller side: paid orders not shipped yet, and shipped orders not delivered yet. */
  ordersToShip: number;
  ordersOnTheWay: number;
  /** Supplier side: parcels to send, and parcels sent but not delivered yet. */
  parcelsToShip: number;
  parcelsOnTheWay: number;
  /** Payments a reseller is making to a supplier right now, on either side. */
  paymentsInProgress: number;
  /** Seller side: money paid to suppliers that may still come back as a refund. */
  sellerMoneyHeld: HeldMoney;
  /** Supplier side: its share of money paid and not released to it yet. */
  supplierMoneyToReceive: HeldMoney;
  /** Return claims still in review, on either side. */
  returnsInReview: number;
}

const PARCEL_TO_SHIP_STATUSES = ["forwarded", "accepted", "picking", "ready"] as const;

const NO_MONEY: HeldMoney = {
  count: 0,
  amountCents: 0,
  lastReleaseAt: null,
  awaitingDelivery: 0,
};

/** Suppliers whose catalog one of the workspaces runs from the supplier panel. */
function suppliersRunBy(database: Database, tenantIds: readonly string[]) {
  return database
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(inArray(suppliers.organizationId, [...tenantIds]));
}

async function countOrders(
  database: Database,
  tenantIds: readonly string[],
  movedSince: Date,
): Promise<{ toShip: number; onTheWay: number }> {
  const recentStatusChange = database
    .select({ id: orderStatusChanges.id })
    .from(orderStatusChanges)
    .where(
      and(eq(orderStatusChanges.orderId, orders.id), gte(orderStatusChanges.changedAt, movedSince)),
    );
  const recentShipmentActivity = database
    .select({ id: orderShipments.id })
    .from(orderShipments)
    .where(
      and(
        eq(orderShipments.orderId, orders.id),
        inArray(orderShipments.status, [...PARCEL_TO_SHIP_STATUSES, "shipped"]),
        gte(orderShipments.updatedAt, movedSince),
      ),
    );
  const rows = await database
    .select({ status: orders.status, total: count() })
    .from(orders)
    .where(
      and(
        inArray(orders.tenantId, [...tenantIds]),
        inArray(orders.status, ["paid", "shipped"]),
        or(
          gte(orders.paidAt, movedSince),
          and(isNull(orders.paidAt), gte(orders.orderedAt, movedSince)),
          exists(recentStatusChange),
          exists(recentShipmentActivity),
        ),
      ),
    )
    .groupBy(orders.status);
  return {
    toShip: rows.find((row) => row.status === "paid")?.total ?? 0,
    onTheWay: rows.find((row) => row.status === "shipped")?.total ?? 0,
  };
}

async function countSupplierParcels(
  database: Database,
  tenantIds: readonly string[],
  movedSince: Date,
): Promise<{ toShip: number; onTheWay: number }> {
  const [row] = await database
    .select({
      toShip:
        sql<number>`count(*) filter (where ${inArray(orderShipments.status, [...PARCEL_TO_SHIP_STATUSES])})`.mapWith(
          Number,
        ),
      onTheWay:
        sql<number>`count(*) filter (where ${eq(orderShipments.status, "shipped")})`.mapWith(
          Number,
        ),
    })
    .from(orderShipments)
    .where(
      and(
        inArray(orderShipments.supplierId, suppliersRunBy(database, tenantIds)),
        gte(orderShipments.updatedAt, movedSince),
      ),
    );
  return { toShip: row?.toShip ?? 0, onTheWay: row?.onTheWay ?? 0 };
}

/**
 * Paid and not settled yet: held by Asaas until it frees the money, or with a refund asked,
 * held for the team or refused by the provider. A refunded payment has left already.
 */
function moneyStillHeld(): SQL | undefined {
  return and(
    eq(shipmentPayments.status, "approved"),
    or(
      and(eq(shipmentPayments.provider, "asaas"), isNull(shipmentPayments.releasedAt)),
      isNotNull(shipmentPayments.refundRequestedAt),
      isNotNull(shipmentPayments.refundHeldAt),
      isNotNull(shipmentPayments.refundFailedAt),
    ),
  );
}

async function sumHeldMoney(
  database: Database,
  side: SQL | undefined,
  amount: SQL<number>,
): Promise<HeldMoney> {
  const [row] = await database
    .select({
      count: count(),
      amountCents: sql<number>`coalesce(sum(${amount}), 0)`.mapWith(Number),
      lastReleaseAt: sql<Date | null>`max(${shipmentPayments.escrowExpiresAt})`.mapWith(
        shipmentPayments.escrowExpiresAt,
      ),
      awaitingDelivery:
        sql<number>`count(*) filter (where ${isNull(shipmentPayments.escrowExpiresAt)})`.mapWith(
          Number,
        ),
    })
    .from(shipmentPayments)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentPayments.shipmentId))
    .where(and(side, moneyStillHeld()));
  if (row === undefined || row.count === 0) {
    return NO_MONEY;
  }
  return row;
}

async function countPaymentsInProgress(
  database: Database,
  tenantIds: readonly string[],
  now: Date,
): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(shipmentPayments)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentPayments.shipmentId))
    .where(
      and(
        or(
          inArray(orderShipments.tenantId, [...tenantIds]),
          inArray(shipmentPayments.supplierId, suppliersRunBy(database, tenantIds)),
        ),
        or(
          eq(shipmentPayments.status, "in_process"),
          // An abandoned checkout stays pending forever: only one still taking payments counts.
          and(eq(shipmentPayments.status, "pending"), gt(shipmentPayments.checkoutExpiresAt, now)),
        ),
      ),
    );
  return row?.total ?? 0;
}

async function countReturnsInReview(
  database: Database,
  tenantIds: readonly string[],
): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(returnClaims)
    .where(
      and(
        eq(returnClaims.status, "in_review"),
        or(
          inArray(returnClaims.sellerTenantId, [...tenantIds]),
          inArray(returnClaims.supplierId, suppliersRunBy(database, tenantIds)),
        ),
      ),
    );
  return row?.total ?? 0;
}

/**
 * Counts what keeps the workspaces from being deleted: orders and parcels still on their way,
 * payments in progress, money still held and returns in review, as seller and as supplier.
 *
 * @param now - The reference time: what has not moved in `STALE_AFTER_DAYS` before it is left out.
 */
export async function findDeletionBlockers(
  database: Database,
  input: { tenantIds: readonly string[]; now: Date },
): Promise<DeletionBlockers> {
  const { tenantIds, now } = input;
  if (tenantIds.length === 0) {
    return emptyDeletionBlockers();
  }
  const movedSince = new Date(now.getTime() - STALE_AFTER_DAYS * DAY_IN_MILLISECONDS);
  const [orderCounts, parcelCounts, paymentsInProgress, sellerMoneyHeld, supplierMoney, returns] =
    await Promise.all([
      countOrders(database, tenantIds, movedSince),
      countSupplierParcels(database, tenantIds, movedSince),
      countPaymentsInProgress(database, tenantIds, now),
      sumHeldMoney(
        database,
        inArray(orderShipments.tenantId, [...tenantIds]),
        sql<number>`${shipmentPayments.amountCents}`,
      ),
      sumHeldMoney(
        database,
        inArray(shipmentPayments.supplierId, suppliersRunBy(database, tenantIds)),
        sql<number>`${shipmentPayments.amountCents} - ${shipmentPayments.platformFeeCents}`,
      ),
      countReturnsInReview(database, tenantIds),
    ]);
  return {
    ordersToShip: orderCounts.toShip,
    ordersOnTheWay: orderCounts.onTheWay,
    parcelsToShip: parcelCounts.toShip,
    parcelsOnTheWay: parcelCounts.onTheWay,
    paymentsInProgress,
    sellerMoneyHeld,
    supplierMoneyToReceive: supplierMoney,
    returnsInReview: returns,
  };
}

function emptyDeletionBlockers(): DeletionBlockers {
  return {
    ordersToShip: 0,
    ordersOnTheWay: 0,
    parcelsToShip: 0,
    parcelsOnTheWay: 0,
    paymentsInProgress: 0,
    sellerMoneyHeld: NO_MONEY,
    supplierMoneyToReceive: NO_MONEY,
    returnsInReview: 0,
  };
}
