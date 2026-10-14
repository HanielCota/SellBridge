import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";
import { orderAdjustmentTypeEnum, orderItemStockStateEnum, orderStatusEnum } from "./enums.ts";
import { listingTargets } from "./listings.ts";
import { storeConnections } from "./stores.ts";
import { supplierProducts } from "./suppliers.ts";

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    storeConnectionId: uuid()
      .notNull()
      .references(() => storeConnections.id, { onDelete: "restrict" }),
    externalOrderId: text().notNull(),
    status: orderStatusEnum().notNull(),
    totalCents: integer().notNull(),
    marketplaceFeeCents: integer().notNull().default(0),
    buyerName: text(),
    orderedAt: timestamp({ withTimezone: true }).notNull(),
    /**
     * When the order was first seen as delivered: the marketplaces don't send a delivery date.
     * An order already delivered when first synced takes its order date.
     */
    deliveredAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("orders_tenant_ordered_idx").on(table.tenantId, table.orderedAt),
    uniqueIndex("orders_external_idx").on(table.storeConnectionId, table.externalOrderId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    listingTargetId: uuid().references(() => listingTargets.id, { onDelete: "set null" }),
    supplierProductId: uuid().references(() => supplierProducts.id, { onDelete: "set null" }),
    title: text().notNull(),
    quantity: integer().notNull(),
    unitPriceCents: integer().notNull(),
    unitCostCents: integer().notNull(),
    /** What this item did to the supplier's stock; items sold before reservations are untracked. */
    stockState: orderItemStockStateEnum().notNull().default("pending"),
    /** When the item first came up short of supplier stock; dates the reseller's warning. */
    shortSince: timestamp({ withTimezone: true }),
  },
  (table) => [
    index("order_items_order_idx").on(table.orderId),
    /** Units sold per listing ("mais vendidos", daily sales). */
    index("order_items_listing_target_idx").on(table.listingTargetId),
    /** Supplier reputation and reviews: from a page of suppliers to their sold items. */
    index("order_items_supplier_product_idx").on(table.supplierProductId),
    /** Paid items the supplier could not cover: the bell and the operations list look them up. */
    index("order_items_short_idx")
      .on(table.tenantId)
      .where(sql`${table.stockState} = 'short'`),
  ],
);

/**
 * Each status an order went into, for the order page's progress. Unlike the public API events,
 * which are pruned after their retention window, these rows live as long as the order.
 */
export const orderStatusChanges = pgTable(
  "order_status_changes",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: orderStatusEnum().notNull(),
    changedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("order_status_changes_order_idx").on(table.orderId, table.changedAt)],
);

export const orderAdjustments = pgTable(
  "order_adjustments",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: orderAdjustmentTypeEnum().notNull(),
    /** Positive amount; the type defines how it affects profit (see docs/decisions.md). */
    amountCents: integer().notNull(),
    reason: text(),
    /**
     * Set on rows the marketplace sync owns ("refund": the money given back across the order's
     * payments), so a later sync updates that row instead of adding another. Null on rows entered
     * by people, which the sync never touches.
     */
    marketplaceKey: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("order_adjustments_order_idx").on(table.orderId),
    uniqueIndex("order_adjustments_marketplace_key_idx").on(table.orderId, table.marketplaceKey),
  ],
);
