import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { DeliveryAddress, FulfillmentStatus } from "@sellbridge/shared/schemas";
import { organization } from "./auth.ts";
import { orders } from "./orders.ts";
import { suppliers } from "./suppliers.ts";

export interface ShipmentItem {
  orderItemId: string;
  title: string;
  sku: string;
  quantity: number;
}
export const orderShipments = pgTable(
  "order_shipments",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    status: text().$type<FulfillmentStatus>().notNull().default("forwarded"),
    address: jsonb().$type<DeliveryAddress>().notNull(),
    items: jsonb().$type<ShipmentItem[]>().notNull(),
    notes: text().notNull().default(""),
    carrier: text(),
    trackingCode: text(),
    trackingUrl: text(),
    supplierTokenHash: text(),
    supplierTokenExpiresAt: timestamp({ withTimezone: true }),
    /** The marketplace's delivery estimate and dispatch deadline, as last read. */
    estimatedDeliveryAt: timestamp({ withTimezone: true }),
    dispatchDeadlineAt: timestamp({ withTimezone: true }),
    /** Last time the marketplace's tracking was read; the periodic job reads the oldest first. */
    trackedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("order_shipments_order_supplier_idx").on(table.orderId, table.supplierId),
    uniqueIndex("order_shipments_token_idx").on(table.supplierTokenHash),
    index("order_shipments_tenant_status_idx").on(table.tenantId, table.status),
    // The tracking job reads parcels still on their way, the least recently read first.
    index("order_shipments_tracking_idx")
      .on(table.trackedAt.asc().nullsFirst())
      .where(sql`${table.status} in ('forwarded','accepted','picking','ready','shipped')`),
    check(
      "order_shipments_status_check",
      sql`${table.status} in ('forwarded','accepted','picking','ready','shipped','delivered','cancelled','not_delivered','returned')`,
    ),
  ],
);
export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    shipmentId: uuid()
      .notNull()
      .references(() => orderShipments.id, { onDelete: "cascade" }),
    status: text().$type<FulfillmentStatus>().notNull(),
    actor: text().notNull(),
    note: text().notNull().default(""),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("shipment_events_shipment_idx").on(table.shipmentId, table.createdAt)],
);
