import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
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
import { supplierProducts, suppliers } from "./suppliers.ts";

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
    /** The buyer's tracking page (`/rastreio/<token>`): only the SHA-256 of its token is kept. */
    buyerTokenHash: text(),
    /** The marketplace's delivery estimate and dispatch deadline, as last read. */
    estimatedDeliveryAt: timestamp({ withTimezone: true }),
    dispatchDeadlineAt: timestamp({ withTimezone: true }),
    /** Last time the marketplace's tracking was read; the periodic job reads the oldest first. */
    trackedAt: timestamp({ withTimezone: true }),
    /**
     * The marketplace label, as this system emitted it: the last time, how many times, and since
     * when the marketplace has said it is not released yet (cleared once it prints).
     */
    labelPrintedAt: timestamp({ withTimezone: true }),
    labelPrintCount: integer().notNull().default(0),
    labelWaitingSince: timestamp({ withTimezone: true }),
    /** The marketplace's own shipment id, read when its label is emitted: its label barcode. */
    marketplaceShipmentId: text(),
    /**
     * How the marketplace moves the parcel (Mercado Livre's `logistic_type`, e.g. cross_docking
     * for a pickup), read with its tracking: the supplier sees whether to wait or take it out.
     */
    marketplaceLogisticType: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("order_shipments_order_supplier_idx").on(table.orderId, table.supplierId),
    uniqueIndex("order_shipments_token_idx").on(table.supplierTokenHash),
    uniqueIndex("order_shipments_buyer_token_idx").on(table.buyerTokenHash),
    index("order_shipments_tenant_status_idx").on(table.tenantId, table.status),
    // Supplier queues and health reports read parcels across reseller tenants.
    index("order_shipments_supplier_status_idx").on(table.supplierId, table.status),
    // The supplier's Pedidos filtered by one reseller.
    index("order_shipments_supplier_tenant_idx").on(table.supplierId, table.tenantId),
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

/** The steps of a supplier's test order, in the order the supplier walks them. */
export const SUPPLIER_TEST_ORDER_STEPS = [
  "received",
  "accepted",
  "label_printed",
  "picked",
  "shipped",
  "delivered",
] as const;
export type SupplierTestOrderStep = (typeof SUPPLIER_TEST_ORDER_STEPS)[number];

/**
 * A simulated order the supplier creates from the panel to watch the flow (accept, label, pick,
 * ship). It lives apart from `orders` and `order_shipments` on purpose: nothing that syncs with a
 * marketplace, charges, pays out or reports reads this table, and it belongs to one supplier.
 */
export const supplierTestOrders = pgTable(
  "supplier_test_orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    supplierProductId: uuid(),
    productTitle: text().notNull(),
    productSku: text().notNull(),
    step: text().$type<SupplierTestOrderStep>().notNull().default("received"),
    dispatchDeadlineAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    labelPrintedAt: timestamp({ withTimezone: true }),
    pickedAt: timestamp({ withTimezone: true }),
    shippedAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One test order at a time per supplier.
    uniqueIndex("supplier_test_orders_supplier_idx").on(table.supplierId),
    // Named by hand: the generated name passes the 63 characters Postgres keeps.
    foreignKey({
      name: "supplier_test_orders_product_fk",
      columns: [table.supplierProductId],
      foreignColumns: [supplierProducts.id],
    }).onDelete("set null"),
    check(
      "supplier_test_orders_step_check",
      sql`${table.step} in ('received','accepted','label_printed','picked','shipped','delivered')`,
    ),
  ],
);
