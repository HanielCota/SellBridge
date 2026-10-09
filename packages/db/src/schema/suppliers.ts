import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    niche: text().notNull(),
    description: text().notNull().default(""),
    state: text().notNull(),
    city: text().notNull(),
    logoUrl: text(),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("suppliers_state_idx").on(table.state)],
);

export const supplierCoverage = pgTable(
  "supplier_coverage",
  {
    id: uuid().primaryKey().defaultRandom(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    state: text().notNull(),
    /** Null means the supplier covers the whole state. */
    city: text(),
  },
  (table) => [
    index("supplier_coverage_state_idx").on(table.state),
    uniqueIndex("supplier_coverage_unique_idx").on(
      table.supplierId,
      table.state,
      sql`coalesce(${table.city}, '')`,
    ),
  ],
);

export const categories = pgTable("categories", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  slug: text().notNull().unique(),
});

export const supplierProducts = pgTable(
  "supplier_products",
  {
    id: uuid().primaryKey().defaultRandom(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    sku: text().notNull(),
    title: text().notNull(),
    description: text().notNull().default(""),
    costCents: integer().notNull(),
    suggestedPriceCents: integer().notNull(),
    stock: integer().notNull().default(0),
    imageUrls: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("supplier_products_sku_idx").on(table.supplierId, table.sku),
    index("supplier_products_supplier_idx").on(table.supplierId),
    index("supplier_products_category_idx").on(table.categoryId),
  ],
);
