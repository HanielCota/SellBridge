import { BLOCKED_ORDER_STATUSES } from "@sellbridge/shared/supplier-panel-orders-tabs";
import { and, desc, eq, notInArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments, shipmentInvoices, suppliers } from "../schema/index.ts";

/** A parcel's NF-e stopped in the supplier's ERP and waits for the supplier to fix it. */
export interface InvoiceStoppedEvent {
  kind: "invoice_stopped";
  /** The parcel whose note stopped. */
  entityId: string;
  at: Date;
  externalOrderId: string;
}

/**
 * Bell entries for a supplier profile: its brand's notes stopped, out of sales still released
 * (a cancelled sale needs no note). They stay until the note leaves "attention".
 */
export async function invoiceStoppedEvents(
  database: Database,
  tenantId: string,
  limit: number,
): Promise<InvoiceStoppedEvent[]> {
  const rows = await database
    .select({
      entityId: shipmentInvoices.shipmentId,
      at: shipmentInvoices.updatedAt,
      externalOrderId: orders.externalOrderId,
    })
    .from(shipmentInvoices)
    .innerJoin(suppliers, eq(suppliers.id, shipmentInvoices.supplierId))
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentInvoices.shipmentId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .where(
      and(
        eq(suppliers.organizationId, tenantId),
        eq(shipmentInvoices.status, "attention"),
        notInArray(orders.status, [...BLOCKED_ORDER_STATUSES]),
      ),
    )
    .orderBy(desc(shipmentInvoices.updatedAt))
    .limit(limit);
  return rows.map((row) => ({ kind: "invoice_stopped" as const, ...row }));
}
