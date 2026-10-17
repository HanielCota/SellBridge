import {
  lateSinceFor,
  shipmentDeadlines,
  shipmentDelay,
  type ShipmentDeadlines,
  type ShipmentDelay,
  type ShipmentTiming,
} from "@sellbridge/shared/shipment-delay";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments, suppliers } from "../schema/index.ts";

/** When the parcel was first marked shipped (the history keeps every step). */
export const firstShippedAt = sql<Date | null>`(
  select min(shipped.created_at) from shipment_events shipped
  where shipped.shipment_id = ${orderShipments.id} and shipped.status = 'shipped'
)`.mapWith((value: string | null) => (value === null ? null : new Date(value)));

/**
 * The latest forward to the supplier: a re-forward of a cancelled parcel starts it over. A note
 * written while the parcel waits keeps the status, so it is also a `forwarded` event; only one
 * that opens a round counts (the first event, or one right after another status), else every
 * note would restart the supplier's accept and dispatch times.
 */
export const latestForwardedAt = sql<Date | null>`(
  select max(forwarded.created_at) from shipment_events forwarded
  where forwarded.shipment_id = ${orderShipments.id} and forwarded.status = 'forwarded'
    and coalesce((
      select previous.status from shipment_events previous
      where previous.shipment_id = forwarded.shipment_id
        and previous.created_at < forwarded.created_at
      order by previous.created_at desc
      limit 1
    ), '') <> 'forwarded'
)`.mapWith((value: string | null) => (value === null ? null : new Date(value)));

/** The supplier's side of the timing: the latest forward and its own hours. */
export const supplierTimingColumns = {
  forwardedAt: latestForwardedAt,
  acceptWithinHours: suppliers.acceptWithinHours,
  dispatchWithinHours: suppliers.dispatchWithinHours,
};

/** By when the supplier must accept and dispatch a parcel read with `supplierTimingColumns`. */
export function supplierDeadlines(
  shipment: Pick<ShipmentTiming, "status" | "dispatchDeadlineAt" | "estimatedDeliveryAt">,
  supplier: Pick<ShipmentTiming, "forwardedAt" | "acceptWithinHours" | "dispatchWithinHours">,
): ShipmentDeadlines {
  return shipmentDeadlines({ ...shipment, ...supplier, shippedAt: null });
}

/** The columns `shipmentDelay` reads, for a select on order_shipments joined to suppliers. */
export const shipmentTimingColumns = {
  status: orderShipments.status,
  dispatchDeadlineAt: orderShipments.dispatchDeadlineAt,
  estimatedDeliveryAt: orderShipments.estimatedDeliveryAt,
  shippedAt: firstShippedAt,
  ...supplierTimingColumns,
};

type TimedShipment = ShipmentTiming;

/**
 * The parcel with what is late about it, if anything, and by when the supplier still has to
 * accept and dispatch it (`shared/domain/shipment-delay.ts`).
 */
export function withShipmentDelay<TShipment extends TimedShipment>(
  shipment: TShipment,
  now: Date,
): TShipment & ShipmentDeadlines & { delay: ShipmentDelay | null } {
  return { ...shipment, ...shipmentDeadlines(shipment), delay: shipmentDelay(shipment, now) };
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
 * When the parcel became late: the same instant `shipmentDelay` starts calling it late. Dating
 * it at the deadline itself put it before a bell opened during that day, so it never counted
 * as new.
 */
function lateSince(shipment: TimedShipment, delay: ShipmentDelay): Date {
  return lateSinceFor(shipment, delay) ?? new Date(0);
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
      ...shipmentTimingColumns,
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
      const event = {
        shipmentId: row.shipmentId,
        entityId: row.entityId,
        externalOrderId: row.externalOrderId,
        supplierName: row.supplierName,
      };
      return [{ ...event, kind: "shipment_late" as const, delay, at: lateSince(row, delay) }];
    })
    .toSorted((left, right) => left.at.getTime() - right.at.getTime())
    .slice(0, input.limit);
}
