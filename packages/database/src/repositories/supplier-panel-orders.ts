import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { describeQueueEntry } from "@sellbridge/shared/supplier-panel-orders";
import {
  isQueueTab,
  SUPPLIER_ORDER_TABS,
  SUPPLIER_TAB_STATUSES,
  supplierOrderProblems,
  type SupplierOrderTab,
} from "@sellbridge/shared/supplier-panel-orders-tabs";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments, storeConnections, suppliers } from "../schema/index.ts";
import { supplierTimingColumns } from "./shipment-timing.ts";
import {
  emailFailed,
  problemFilter,
  queueDueAt,
  searchFilter,
  supplierScope,
} from "./supplier-panel-orders-sql.ts";

export const SUPPLIER_ORDERS_PAGE_SIZE = 25;

export interface SupplierShipmentsQuery {
  supplierId: string;
  tab: SupplierOrderTab;
  query: string;
  page: number;
}

function tabFilter(tab: SupplierOrderTab, now: Date): SQL | undefined {
  if (tab === "problem") {
    return problemFilter(now);
  }
  return inArray(orderShipments.status, [...SUPPLIER_TAB_STATUSES[tab]]);
}

/**
 * What the supplier sees of a parcel in the list: the order number, the items, where it goes
 * (city and state only) and its timing. No buyer name, no street, no reseller or price data:
 * the full address shows only in the parcel's panel, as on the supplier link.
 */
const rowColumns = {
  id: orderShipments.id,
  orderId: orderShipments.orderId,
  status: orderShipments.status,
  externalOrderId: orders.externalOrderId,
  orderStatus: orders.status,
  marketplace: storeConnections.marketplace,
  items: orderShipments.items,
  destinationCity: sql<string>`${orderShipments.address}->>'city'`,
  destinationState: sql<string>`${orderShipments.address}->>'state'`,
  carrier: orderShipments.carrier,
  trackingCode: orderShipments.trackingCode,
  dispatchDeadlineAt: orderShipments.dispatchDeadlineAt,
  estimatedDeliveryAt: orderShipments.estimatedDeliveryAt,
  updatedAt: orderShipments.updatedAt,
  emailFailed,
  ...supplierTimingColumns,
};

function shipmentsFrom(database: Database) {
  return database
    .select(rowColumns)
    .from(orderShipments)
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId));
}

function orderFor(tab: SupplierOrderTab) {
  if (isQueueTab(tab)) {
    return [
      sql`${queueDueAt} asc nulls last`,
      sql`${supplierTimingColumns.forwardedAt} asc nulls last`,
      asc(orderShipments.id),
    ];
  }
  return [desc(orderShipments.updatedAt), asc(orderShipments.id)];
}

type ShipmentRow = Awaited<ReturnType<ReturnType<typeof shipmentsFrom>["where"]>>[number];

/** The row with its deadline-first reading and its problems, both from the shared domain. */
function presentRow(row: ShipmentRow, now: Date) {
  const entry = describeQueueEntry(row, now, { orderStatus: row.orderStatus });
  const problems = supplierOrderProblems({
    overdue: entry.urgency === "overdue",
    emailFailed: row.emailFailed,
    orderStatus: row.orderStatus,
  });
  const items = row.items.map(({ title, sku, quantity }) => ({ title, sku, quantity }));
  return { ...row, items, ...entry, problems };
}
export type SupplierShipmentRow = ReturnType<typeof presentRow>;

async function countMatching(database: Database, filter: SQL | undefined) {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(orderShipments)
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .where(filter);
  return row?.total ?? 0;
}

/**
 * One page of the supplier's parcels across every reseller it serves: queue tabs most urgent
 * first, history tabs latest change first. A page past the end shows the last one instead.
 */
export async function listSupplierShipments(
  database: Database,
  input: SupplierShipmentsQuery,
  now: Date = new Date(),
) {
  const filter = and(
    supplierScope(input.supplierId),
    tabFilter(input.tab, now),
    searchFilter(input.query),
  );
  const total = await countMatching(database, filter);
  const totalPages = Math.ceil(total / SUPPLIER_ORDERS_PAGE_SIZE);
  const page = Math.min(input.page, Math.max(1, totalPages));
  const rows = await shipmentsFrom(database)
    .where(filter)
    .orderBy(...orderFor(input.tab))
    .limit(SUPPLIER_ORDERS_PAGE_SIZE)
    .offset((page - 1) * SUPPLIER_ORDERS_PAGE_SIZE);
  return {
    items: rows.map((row) => presentRow(row, now)),
    page,
    total,
    totalPages,
  };
}

/** Fetch each home group independently so a full page of one cannot hide the other. */
export async function listSupplierHomeShipments(
  database: Database,
  supplierId: string,
  limit: number,
  now: Date = new Date(),
): Promise<SupplierShipmentRow[]> {
  const groups: FulfillmentStatus[][] = [["forwarded"], ["accepted", "picking", "ready"]];
  const rows = await Promise.all(
    groups.map((statuses) =>
      shipmentsFrom(database)
        .where(and(supplierScope(supplierId), inArray(orderShipments.status, statuses)))
        .orderBy(...orderFor("todo"))
        .limit(limit),
    ),
  );
  return rows.flatMap((group) => group.map((row) => presentRow(row, now)));
}

function countColumn(filter: SQL | undefined) {
  return sql<number>`(count(*) filter (where ${filter ?? sql`true`}))::int`;
}

/** How many parcels each tab holds, with the same search applied, in one read. */
export async function countSupplierShipmentsByTab(
  database: Database,
  input: { supplierId: string; query: string },
  now: Date = new Date(),
): Promise<Record<SupplierOrderTab, number>> {
  const columns = Object.fromEntries(
    SUPPLIER_ORDER_TABS.map((tab) => [tab, countColumn(tabFilter(tab, now))]),
  );
  const [row] = await database
    .select(columns)
    .from(orderShipments)
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .where(and(supplierScope(input.supplierId), searchFilter(input.query)));
  return tabCounts(row);
}

function tabCounts(row: Record<string, number> | undefined): Record<SupplierOrderTab, number> {
  const read = (tab: SupplierOrderTab) => row?.[tab] ?? 0;
  return {
    todo: read("todo"),
    forwarded: read("forwarded"),
    accepted: read("accepted"),
    picking: read("picking"),
    ready: read("ready"),
    problem: read("problem"),
    shipped: read("shipped"),
    closed: read("closed"),
  };
}

/** Ids among `shipmentIds` that belong to the supplier, with their status and order. */
export async function supplierOwnedShipments(
  database: Database,
  supplierId: string,
  shipmentIds: readonly string[],
): Promise<{ id: string; status: FulfillmentStatus; orderStatus: string }[]> {
  if (shipmentIds.length === 0) {
    return [];
  }
  return database
    .select({ id: orderShipments.id, status: orderShipments.status, orderStatus: orders.status })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .where(
      and(eq(orderShipments.supplierId, supplierId), inArray(orderShipments.id, [...shipmentIds])),
    );
}
