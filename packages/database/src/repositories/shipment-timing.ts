import {
  CONFIRMATION_REMINDER_DAYS,
  overdueSince,
  shipmentDelay,
  type ShipmentDelay,
} from "@sellbridge/shared/shipment-delay";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments, suppliers } from "../schema/index.ts";

const DAY_MILLISECONDS = 86_400_000;

/** When the parcel was first marked shipped (the history keeps every step). */
export const firstShippedAt = sql<Date | null>`(
  select min(shipped.created_at) from shipment_events shipped
  where shipped.shipment_id = ${orderShipments.id} and shipped.status = 'shipped'
)`.mapWith((value: string | null) => (value === null ? null : new Date(value)));

interface TimedShipment {
  status: FulfillmentStatus;
  dispatchDeadlineAt: Date | null;
  estimatedDeliveryAt: Date | null;
  shippedAt: Date | null;
}

/** The parcel with what is late about it, if anything (`shared/domain/shipment-delay.ts`). */
export function withShipmentDelay<TShipment extends TimedShipment>(
  shipment: TShipment,
  now: Date,
): TShipment & { delay: ShipmentDelay | null } {
  return { ...shipment, delay: shipmentDelay(shipment, now) };
}

/** A parcel of an order that is late: what is late and whose parcel it is. */
export interface ShipmentLateEvent {
  kind: "shipment_late";
  entityId: string;
  at: Date;
  shipmentId: string;
  externalOrderId: string;
  supplierName: string;
  delay: ShipmentDelay;
}

/**
 * When the parcel became late: the end of the missed day (the same instant `shipmentDelay`
 * starts calling it late), or the end of the wait for a confirmation. Dating it at the deadline
 * itself put it before a bell opened during that day, so the alert never counted as new.
 */
function lateSince(shipment: TimedShipment, delay: ShipmentDelay): Date {
  if (delay === "dispatch_overdue" && shipment.dispatchDeadlineAt !== null) {
    return overdueSince(shipment.dispatchDeadlineAt);
  }
  if (delay === "delivery_overdue" && shipment.estimatedDeliveryAt !== null) {
    return overdueSince(shipment.estimatedDeliveryAt);
  }
  const shippedAt = shipment.shippedAt ?? new Date(0);
  return new Date(shippedAt.getTime() + CONFIRMATION_REMINDER_DAYS * DAY_MILLISECONDS);
}

/** Parcels still with the supplier or on their way: the only ones that can be late. */
const OPEN_STATUSES: FulfillmentStatus[] = ["forwarded", "accepted", "picking", "ready", "shipped"];

/** Late parcels of the tenant's live orders, oldest delay first, at most `limit`. */
export async function shipmentLateEvents(
  database: Database,
  input: { tenantId: string; limit: number; now: Date },
): Promise<ShipmentLateEvent[]> {
  const rows = await database
    .select({
      shipmentId: orderShipments.id,
      entityId: orders.id,
      externalOrderId: orders.externalOrderId,
      supplierName: suppliers.name,
      status: orderShipments.status,
      dispatchDeadlineAt: orderShipments.dispatchDeadlineAt,
      estimatedDeliveryAt: orderShipments.estimatedDeliveryAt,
      shippedAt: firstShippedAt,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(
        eq(orderShipments.tenantId, input.tenantId),
        eq(orders.tenantId, input.tenantId),
        inArray(orderShipments.status, OPEN_STATUSES),
        inArray(orders.status, ["paid", "shipped"]),
      ),
    )
    .orderBy(asc(orderShipments.createdAt));
  return rows
    .flatMap((row) => {
      const delay = shipmentDelay(row, input.now);
      if (delay === null) {
        return [];
      }
      const {
        status: _status,
        dispatchDeadlineAt: _deadline,
        estimatedDeliveryAt: _estimate,
        shippedAt: _shippedAt,
        ...event
      } = row;
      return [{ ...event, kind: "shipment_late" as const, delay, at: lateSince(row, delay) }];
    })
    .toSorted((left, right) => left.at.getTime() - right.at.getTime())
    .slice(0, input.limit);
}
