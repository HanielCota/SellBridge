import { SHIPMENT_ACTORS, type Marketplace } from "@sellbridge/shared/schemas";
import {
  LABEL_MARKETPLACE,
  LABEL_STATUSES,
  type SupplierLabelState,
} from "@sellbridge/shared/supplier-order-labels";
import { SUPPLIER_QUEUE_STATUSES } from "@sellbridge/shared/supplier-panel-orders";
import { BLOCKED_ORDER_STATUSES } from "@sellbridge/shared/supplier-panel-orders-tabs";
import {
  and,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  orders,
  orderShipments,
  shipmentEvents,
  storeConnections,
  suppliers,
} from "../schema/index.ts";
import { latestForwardedAt } from "./shipment-timing.ts";
import { containsPattern } from "./sql/search-pattern.ts";

/**
 * SQL twins of `shared/domain/supplier-panel-orders.ts`, so the queue can be sorted and paged by
 * the database. The repository test checks that this order matches `compareQueueUrgency`.
 */

/** Brazil keeps a fixed -03:00 offset (no daylight saving since 2019), as `period-range` does. */
const BRAZIL_OFFSET = sql.raw("interval '3 hours'");

/** The end of the Brazil calendar day of a timestamp: the instant `overdueSince` returns. */
function endOfBrazilDay(column: SQL | typeof orderShipments.dispatchDeadlineAt): SQL<Date | null> {
  return sql<Date | null>`((date_trunc('day', (${column} at time zone 'UTC') - ${BRAZIL_OFFSET}) + interval '1 day' + ${BRAZIL_OFFSET}) at time zone 'UTC')`;
}

const acceptAt = sql`(${latestForwardedAt} + ${suppliers.acceptWithinHours} * interval '1 hour')`;
const dispatchAt = sql`coalesce(${endOfBrazilDay(orderShipments.dispatchDeadlineAt)}, ${latestForwardedAt} + ${suppliers.dispatchWithinHours} * interval '1 hour')`;

const QUEUE_LIST = sql.raw(SUPPLIER_QUEUE_STATUSES.map((status) => `'${status}'`).join(","));

const BLOCKED_LIST = sql.raw(BLOCKED_ORDER_STATUSES.map((status) => `'${status}'`).join(","));

/**
 * When the parcel's next step turns late; null outside the queue and for a sale not released
 * for shipping, as `describeQueueEntry` says. `least` skips nulls.
 */
export const queueDueAt = sql<Date | null>`(case
  when ${orders.status} in (${BLOCKED_LIST}) then null
  when ${orderShipments.status} = 'forwarded' then least(${acceptAt}, ${dispatchAt})
  when ${orderShipments.status} in (${QUEUE_LIST}) then ${dispatchAt}
end)`;

export function overdueAt(now: Date): SQL<boolean> {
  return sql<boolean>`coalesce(${queueDueAt} <= ${now.toISOString()}::timestamptz, false)`;
}

/**
 * The note `noteSupplierEmailFailed` (auto-forward.ts) writes when the order e-mail bounced.
 * Kept in sync by the repository test, which writes it through that function.
 */
const SUPPLIER_EMAIL_FAILED_NOTE =
  "O e-mail ao fornecedor não foi enviado. Gere um novo link e envie a ele.";

/** Only a parcel still waiting for the accept: once accepted, the supplier clearly got it. */
export const emailFailed = sql<boolean>`(${orderShipments.status} = 'forwarded' and exists (
  select 1 from ${shipmentEvents}
  where ${shipmentEvents.shipmentId} = ${orderShipments.id}
    and ${shipmentEvents.actor} = ${SHIPMENT_ACTORS.sellbridge}
    and ${shipmentEvents.note} = ${SUPPLIER_EMAIL_FAILED_NOTE}
))`;

export const orderBlocked = inArray(orders.status, [...BLOCKED_ORDER_STATUSES]);

/** A queue parcel past its time, not released for shipping, or whose e-mail never arrived. */
export function problemFilter(now: Date): SQL | undefined {
  return and(
    inArray(orderShipments.status, [...SUPPLIER_QUEUE_STATUSES]),
    or(overdueAt(now), orderBlocked, emailFailed),
  );
}

/**
 * Order number, tracking code, buyer, reseller store or any SKU of the parcel, anywhere in the
 * text: whatever the supplier has at hand when a reseller or a buyer asks about a parcel.
 */
export function searchFilter(query: string): SQL | undefined {
  if (query === "") {
    return undefined;
  }
  const pattern = containsPattern(query);
  return or(
    ilike(orders.externalOrderId, pattern),
    ilike(orderShipments.trackingCode, pattern),
    ilike(orders.buyerName, pattern),
    ilike(storeConnections.shopName, pattern),
    sql`exists (select 1 from jsonb_array_elements(${orderShipments.items}) as item where item->>'sku' ilike ${pattern})`,
  );
}

/** SQL twin of `supplierLabelState` (shared/domain/supplier-order-labels.ts). */
export function labelFilter(state: SupplierLabelState, now: Date): SQL | undefined {
  const hasLabel = and(
    eq(storeConnections.marketplace, LABEL_MARKETPLACE),
    inArray(orderShipments.status, [...LABEL_STATUSES]),
  );
  if (state === "printed") {
    return and(hasLabel, gt(orderShipments.labelPrintCount, 0));
  }
  const neverPrinted = and(hasLabel, eq(orderShipments.labelPrintCount, 0));
  if (state === "waiting") {
    return and(neverPrinted, isNotNull(orderShipments.labelWaitingSince));
  }
  const released = and(neverPrinted, isNull(orderShipments.labelWaitingSince));
  if (state === "late") {
    return and(released, overdueAt(now));
  }
  return and(released, not(overdueAt(now)));
}

/** The list filters besides the tab: search, sale date, channel, reseller store and label. */
export interface SupplierShipmentFilters {
  query: string;
  /** Inclusive start of the sale date. */
  orderedFrom?: Date | undefined;
  /** Exclusive end of the sale date. */
  orderedTo?: Date | undefined;
  channel?: Marketplace | undefined;
  /** The reseller's store connection. */
  store?: string | undefined;
  label?: SupplierLabelState | undefined;
}

/** All the list filters as one condition; a filter left out narrows nothing. */
export function shipmentFilters(filters: SupplierShipmentFilters, now: Date): SQL | undefined {
  return and(
    searchFilter(filters.query),
    filters.orderedFrom === undefined ? undefined : gte(orders.orderedAt, filters.orderedFrom),
    filters.orderedTo === undefined ? undefined : lt(orders.orderedAt, filters.orderedTo),
    filters.channel === undefined ? undefined : eq(storeConnections.marketplace, filters.channel),
    filters.store === undefined ? undefined : eq(orders.storeConnectionId, filters.store),
    filters.label === undefined ? undefined : labelFilter(filters.label, now),
  );
}

export function supplierScope(supplierId: string): SQL | undefined {
  return and(eq(orderShipments.supplierId, supplierId), eq(suppliers.id, supplierId));
}
