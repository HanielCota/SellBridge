import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";
import { orders } from "./orders.ts";
import { suppliers } from "./suppliers.ts";

/**
 * A reseller's review of how a supplier handled one delivered order. An order with items of
 * two suppliers gets one review per supplier. Reviews feed a score shared by every tenant.
 */
export const supplierReviews = pgTable(
  "supplier_reviews",
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
      .references(() => suppliers.id, { onDelete: "cascade" }),
    /** 1 to 5 stars. */
    rating: integer().notNull(),
    /** Aspect tags such as `dispatch:good`; see REVIEW_TAGS in @sellbridge/shared. */
    tags: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    comment: text().notNull().default(""),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("supplier_reviews_order_supplier_idx").on(table.orderId, table.supplierId),
    index("supplier_reviews_supplier_created_idx").on(table.supplierId, table.createdAt),
    index("supplier_reviews_tenant_idx").on(table.tenantId),
    check("supplier_reviews_rating_check", sql`${table.rating} between 1 and 5`),
  ],
);
