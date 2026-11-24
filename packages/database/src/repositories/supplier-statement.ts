import type { StatementPayment } from "@sellbridge/shared/supplier-statement";
import { and, desc, eq, gte, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  orders,
  orderShipments,
  shipmentEvents,
  shipmentPayments,
  type ShipmentItem,
} from "../schema/index.ts";

/** A line of the supplier's statement: the paid parcel's payment and the order it belongs to. */
export interface SupplierStatementRow extends StatementPayment {
  id: string;
  shipmentId: string;
  externalOrderId: string;
  items: ShipmentItem[];
}

/** Where the next page of a statement starts: right after this payment. */
export interface StatementCursor {
  paidAt: Date;
  id: string;
}

interface StatementPeriod {
  supplierId: string;
  from: Date;
  to: Date;
}

/** Payments whose money was taken: paid, given back, or disputed on the card. */
const TAKEN_STATUSES = ["approved", "refunded", "charged_back"] as const;

const firstDeliveredAt = sql<Date | null>`(
  select min(${shipmentEvents.createdAt}) from ${shipmentEvents}
  where ${shipmentEvents.shipmentId} = ${shipmentPayments.shipmentId}
    and ${shipmentEvents.status} = 'delivered'
)`.mapWith((value: string | null) => (value === null ? null : new Date(value)));

const paymentColumns = {
  provider: shipmentPayments.provider,
  status: shipmentPayments.status,
  amountCents: shipmentPayments.amountCents,
  platformFeeCents: shipmentPayments.platformFeeCents,
  providerFeeCents: shipmentPayments.providerFeeCents,
  paymentMethod: shipmentPayments.paymentMethod,
  paidAt: sql<Date>`${shipmentPayments.paidAt}`.mapWith(shipmentPayments.paidAt),
  refundRequestedAt: shipmentPayments.refundRequestedAt,
  refundFailedAt: shipmentPayments.refundFailedAt,
  refundHeldAt: shipmentPayments.refundHeldAt,
  releasedAt: shipmentPayments.releasedAt,
  escrowStatus: shipmentPayments.escrowStatus,
  teamDecision: shipmentPayments.teamDecision,
  teamDecisionAt: shipmentPayments.teamDecisionAt,
  deliveredAt: firstDeliveredAt,
};

function periodFilter(period: StatementPeriod): SQL | undefined {
  return and(
    eq(shipmentPayments.supplierId, period.supplierId),
    isNotNull(shipmentPayments.paidAt),
    gte(shipmentPayments.paidAt, period.from),
    lt(shipmentPayments.paidAt, period.to),
    inArray(shipmentPayments.status, [...TAKEN_STATUSES]),
  );
}

function afterCursor(cursor: StatementCursor | null): SQL | undefined {
  if (cursor === null) {
    return undefined;
  }
  return or(
    lt(shipmentPayments.paidAt, cursor.paidAt),
    and(eq(shipmentPayments.paidAt, cursor.paidAt), lt(shipmentPayments.id, cursor.id)),
  );
}

/**
 * One page of a supplier's paid parcels in a period (by the day the reseller paid), newest first.
 *
 * @param input.limit - The page size, between 1 and 100.
 */
export async function listSupplierStatementRows(
  database: Database,
  input: StatementPeriod & { cursor: StatementCursor | null; limit: number },
): Promise<SupplierStatementRow[]> {
  return database
    .select({
      id: shipmentPayments.id,
      shipmentId: shipmentPayments.shipmentId,
      externalOrderId: orders.externalOrderId,
      items: orderShipments.items,
      ...paymentColumns,
    })
    .from(shipmentPayments)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentPayments.shipmentId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .where(and(periodFilter(input), afterCursor(input.cursor)))
    .orderBy(desc(shipmentPayments.paidAt), desc(shipmentPayments.id))
    .limit(input.limit);
}

/**
 * Every paid parcel of a supplier in a period, with only what the totals need: a month holds at
 * most a few thousand parcels for one supplier, so the totals are added up from these.
 */
export async function listSupplierStatementPayments(
  database: Database,
  input: StatementPeriod,
): Promise<StatementPayment[]> {
  return database.select(paymentColumns).from(shipmentPayments).where(periodFilter(input));
}
