import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";
import { orderAdjustmentTypeEnum, orderStatusEnum } from "./enums.ts";
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
  },
  (table) => [index("order_items_order_idx").on(table.orderId)],
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
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("order_adjustments_order_idx").on(table.orderId)],
);
