import {
  STAFF_SHIPMENT_GROUPS,
  STAFF_SHIPMENTS_PAGE_SIZE,
  type FulfillmentStatus,
  type StaffShipmentGroup,
} from "@sellbridge/shared/schemas";
import { and, count, desc, eq, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  orders,
  orderShipments,
  organization,
  storeConnections,
  suppliers,
} from "../schema/index.ts";
import { shipmentTimingColumns, withShipmentDelay } from "./shipment-timing.ts";
import { containsPattern } from "./sql/search-pattern.ts";

/** Still with the supplier (or the reseller's own stock): what can miss the dispatch deadline. */
const BEFORE_DISPATCH: readonly FulfillmentStatus[] = ["forwarded", "accepted", "picking", "ready"];
const DELIVERY_PROBLEMS: readonly FulfillmentStatus[] = ["not_delivered", "returned"];

function groupCondition(group: StaffShipmentGroup, now: Date): SQL | undefined {
  if (group === "late") {
    return or(
      and(eq(orderShipments.status, "shipped"), lt(orderShipments.estimatedDeliveryAt, now)),
      and(
        inArray(orderShipments.status, [...BEFORE_DISPATCH]),
        lt(orderShipments.dispatchDeadlineAt, now),
      ),
    );
  }
  if (group === "problem") {
    return inArray(orderShipments.status, [...DELIVERY_PROBLEMS]);
  }
  if (group === "transit") {
    return eq(orderShipments.status, "shipped");
  }
  if (group === "delivered") {
    return eq(orderShipments.status, "delivered");
  }
  return undefined;
}

/** Spaces, dots and dashes are typing noise in a code: compared without them, in capitals. */
const normalizedTrackingCode = sql`upper(regexp_replace(${orderShipments.trackingCode}, '[[:space:].-]', '', 'g'))`;

/** A tracking code or order number exactly, or part of the reseller's or supplier's name. */
function searchCondition(query: string | undefined): SQL | undefined {
  if (query === undefined || query === "") {
    return undefined;
  }
  const code = query.replaceAll(/[\s.-]/g, "").toUpperCase();
  const pattern = containsPattern(query);
  return or(
    sql`${normalizedTrackingCode} = ${code}`,
    sql`upper(${orders.externalOrderId}) = upper(${query.trim().replace(/^#/, "")})`,
    ilike(organization.name, pattern),
    ilike(suppliers.name, pattern),
  );
}

const staffShipmentColumns = {
  shipmentId: orderShipments.id,
  orderId: orders.id,
  externalOrderId: orders.externalOrderId,
  marketplace: storeConnections.marketplace,
  sellerName: organization.name,
  supplierName: suppliers.name,
  catalogKind: suppliers.catalogKind,
  carrier: orderShipments.carrier,
  trackingCode: orderShipments.trackingCode,
  updatedAt: orderShipments.updatedAt,
  ...shipmentTimingColumns,
};

function staffShipmentsBase(database: Database) {
  return database
    .select(staffShipmentColumns)
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .innerJoin(organization, eq(organization.id, orderShipments.tenantId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId));
}

/**
 * Every customer's parcels for the staff "Envios" page, the latest change first. No tenant
 * filter on purpose: only server functions behind `shipments.view` call this.
 */
export async function listStaffShipments(
  database: Database,
  input: { group: StaffShipmentGroup; query?: string | undefined; page: number },
) {
  const now = new Date();
  const condition = and(groupCondition(input.group, now), searchCondition(input.query));
  const [total] = await database
    .select({ value: count() })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(organization, eq(organization.id, orderShipments.tenantId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(condition);
  const rows = await staffShipmentsBase(database)
    .where(condition)
    .orderBy(desc(orderShipments.updatedAt), desc(orderShipments.id))
    .limit(STAFF_SHIPMENTS_PAGE_SIZE)
    .offset((input.page - 1) * STAFF_SHIPMENTS_PAGE_SIZE);
  const totalItems = total?.value ?? 0;
  return {
    items: rows.map((row) => withShipmentDelay(row, now)),
    total: totalItems,
    page: input.page,
    totalPages: Math.max(1, Math.ceil(totalItems / STAFF_SHIPMENTS_PAGE_SIZE)),
  };
}

/**
 * Parcels late or with a delivery problem, for the "Pedidos" nav badge: the reseller's (its
 * tenant) or a supplier's (the parcels it ships, by its organization).
 */
export async function countParcelAlerts(
  database: Database,
  scope: { tenantId: string } | { supplierOrganizationId: string; includeForwarded?: boolean },
): Promise<number> {
  const now = new Date();
  const alerts = or(
    groupCondition("late", now),
    groupCondition("problem", now),
    "supplierOrganizationId" in scope && scope.includeForwarded === true
      ? eq(orderShipments.status, "forwarded")
      : undefined,
  );
  const owner =
    "tenantId" in scope
      ? eq(orderShipments.tenantId, scope.tenantId)
      : and(
          eq(suppliers.organizationId, scope.supplierOrganizationId),
          eq(suppliers.catalogKind, "supplier"),
        );
  const [row] = await database
    .select({ value: count() })
    .from(orderShipments)
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(and(owner, alerts));
  return row?.value ?? 0;
}

/** How many parcels each filter holds, for the tab counts and the "Envios" nav badge. */
export async function countStaffShipmentsByGroup(
  database: Database,
): Promise<Record<StaffShipmentGroup, number>> {
  const now = new Date();
  const counts = await Promise.all(
    STAFF_SHIPMENT_GROUPS.map(async (group) => {
      const [row] = await database
        .select({ value: count() })
        .from(orderShipments)
        .where(groupCondition(group, now));
      return [group, row?.value ?? 0] as const;
    }),
  );
  const empty: Record<StaffShipmentGroup, number> = {
    all: 0,
    late: 0,
    problem: 0,
    transit: 0,
    delivered: 0,
  };
  return counts.reduce((totals, [group, value]) => ({ ...totals, [group]: value }), empty);
}
