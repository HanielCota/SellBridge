import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  PRODUCT_REVIEW_STATUSES,
  type RejectionReason,
} from "@sellbridge/shared/supplier-panel-catalog-status";
import { organization } from "./auth.ts";

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
    /** Where the order e-mails go; admin-only, never shown to resellers. */
    contactEmail: text(),
    /** Hours the supplier has to accept a forwarded order. */
    acceptWithinHours: integer().notNull().default(24),
    /** Hours the supplier has to dispatch it, counted from the forward. */
    dispatchWithinHours: integer().notNull().default(48),
    active: boolean().notNull().default(true),
    /**
     * The supplier profile (organization of kind `supplier`) that runs this catalog from the
     * supplier panel. Null for suppliers the team still manages on their behalf.
     */
    organizationId: text().references(() => organization.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("suppliers_state_idx").on(table.state),
    uniqueIndex("suppliers_organization_id_unique").on(table.organizationId),
    check(
      "suppliers_deadlines_check",
      sql`${table.acceptWithinHours} between 1 and 720 and ${table.dispatchWithinHours} between ${table.acceptWithinHours} and 720`,
    ),
  ],
);

export const categories = pgTable("categories", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  slug: text().notNull().unique(),
});

/** Supplier panel review lifecycle (see shared/domain/supplier-panel-catalog-status.ts). */
export const supplierProductReviewStatusEnum = pgEnum(
  "supplier_product_review_status",
  PRODUCT_REVIEW_STATUSES,
);

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
    /** Shelf count, as the supplier reports it (admin form and CSV). */
    stock: integer().notNull().default(0),
    /** Units held by paid orders that have not shipped; sellable = stock − reservedStock. */
    reservedStock: integer().notNull().default(0),
    imageUrls: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    mercadoLivreAttributes: jsonb().$type<Record<string, string>>().notNull().default({}),
    active: boolean().notNull().default(true),
    /**
     * Only approved products reach resellers. Admin form and CSV rows default to approved (the
     * admin is the reviewer); the supplier panel creates drafts explicitly.
     */
    reviewStatus: supplierProductReviewStatusEnum().notNull().default("approved"),
    rejectionReasons: jsonb().$type<RejectionReason[]>().notNull().default([]),
    submittedAt: timestamp({ withTimezone: true }),
    reviewedAt: timestamp({ withTimezone: true }),
    /** User id of the admin who approved or rejected the product; no FK so audit outlives it. */
    reviewedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("supplier_products_review_status_idx").on(table.supplierId, table.reviewStatus),
    check(
      "supplier_products_rejection_reasons_check",
      sql`${table.reviewStatus} <> 'rejected' or jsonb_array_length(${table.rejectionReasons}) > 0`,
    ),
    uniqueIndex("supplier_products_sku_idx").on(table.supplierId, table.sku),
    index("supplier_products_supplier_idx").on(table.supplierId),
    index("supplier_products_category_idx").on(table.categoryId),
    /**
     * The catalog search ("calca verde" finds "Calça jeans - Verde") matches `sellbridge_fold`
     * of title and SKU with `like '%word%'`: trigram indexes answer it without a full scan.
     */
    index("supplier_products_title_trgm_idx").using(
      "gin",
      sql`sellbridge_fold(${table.title}) gin_trgm_ops`,
    ),
    index("supplier_products_sku_trgm_idx").using(
      "gin",
      sql`sellbridge_fold(${table.sku}) gin_trgm_ops`,
    ),
    check("supplier_products_reserved_stock_check", sql`${table.reservedStock} >= 0`),
  ],
);
