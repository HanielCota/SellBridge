import { shipmentLateContent } from "@sellbridge/shared/notification-events";
import { lateSinceFor, shipmentDelay } from "@sellbridge/shared/shipment-delay";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments, suppliers } from "../schema/index.ts";
import { clipText, notifyWorkspace } from "./notification-producers.ts";
import { shipmentTimingColumns } from "./shipment-timing.ts";

/**
 * A delay older than this was already news before the sweep existed (or while the worker was
 * down): only parcels that became late recently are worth an e-mail.
 */
const RECENT_DELAY_MILLISECONDS = 3 * 24 * 60 * 60 * 1000;

/** Same statuses `shipmentLateEvents` treats as able to be late. */
const OPEN_STATUSES: FulfillmentStatus[] = ["forwarded", "accepted", "picking", "ready", "shipped"];

/**
 * A delay has no moment of its own (time just passes the deadline), so a sweep finds parcels
 * that became late recently and notifies each delay once (`shipment:<id>:late:<delay>`).
 * Returns how many deliveries were new (each member, each channel).
 */
export async function queueLateShipmentNotices(
  database: Database,
  input: { now: Date; tenantId?: string | undefined },
): Promise<number> {
  const rows = await database
    .select({
      shipmentId: orderShipments.id,
      tenantId: orderShipments.tenantId,
      orderId: orders.id,
      externalOrderId: orders.externalOrderId,
      supplierName: suppliers.name,
      ...shipmentTimingColumns,
    })
    .from(orderShipments)
    .innerJoin(
      orders,
      and(eq(orders.id, orderShipments.orderId), eq(orders.tenantId, orderShipments.tenantId)),
    )
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(
        input.tenantId === undefined ? undefined : eq(orderShipments.tenantId, input.tenantId),
        inArray(orderShipments.status, OPEN_STATUSES),
        inArray(orders.status, ["paid", "shipped"]),
      ),
    );
  let queued = 0;
  for (const row of rows) {
    const delay = shipmentDelay(row, input.now);
    if (delay === null) {
      continue;
    }
    const since = lateSinceFor(row, delay);
    if (since === null || input.now.getTime() - since.getTime() > RECENT_DELAY_MILLISECONDS) {
      continue;
    }
    queued += await notifyWorkspace(database, {
      tenantId: row.tenantId,
      event: "shipment_late",
      dedupeKey: `shipment:${row.shipmentId}:late:${delay}`,
      content: shipmentLateContent({
        orderId: row.orderId,
        externalOrderId: row.externalOrderId,
        supplierName: clipText(row.supplierName, 80),
        delay,
      }),
    });
  }
  return queued;
}
