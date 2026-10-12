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
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("order_shipments_order_supplier_idx").on(table.orderId, table.supplierId),
    uniqueIndex("order_shipments_token_idx").on(table.supplierTokenHash),
    index("order_shipments_tenant_status_idx").on(table.tenantId, table.status),
    check(
      "order_shipments_status_check",
      sql`${table.status} in ('forwarded','accepted','picking','ready','shipped','delivered','cancelled')`,
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
