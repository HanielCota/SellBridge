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
import type { ProductFiscalPatch } from "@sellbridge/shared/product-fiscal";
import type { SupplierFiscalProfileInput } from "@sellbridge/shared/supplier-fiscal";
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
     * When the supplier closed the store for sales (holidays, no stock); null while open. Unlike
     * `active`, which the team owns, the supplier switches it: listings sync zero stock while it
     * is set and get their stock back once it is cleared.
     */
    salesClosedAt: timestamp({ withTimezone: true }),
    /**
     * The supplier profile (organization of kind `supplier`) that runs this catalog from the
     * supplier panel. Null for suppliers the team still manages on their behalf.
     */
    organizationId: text().references(() => organization.id, { onDelete: "set null" }),
    /** The legacy table also holds private, self-fulfilled seller catalog sources. */
    catalogKind: text({ enum: ["supplier", "seller"] })
      .notNull()
      .default("supplier"),
    /** Private sources belong to a seller tenant and never enter the supplier directory. */
    ownerTenantId: text().references(() => organization.id, { onDelete: "cascade" }),
    /**
     * The company as its NF-e names it (CNPJ, state registration, regime, fiscal address with the
     * IBGE city code) and the tax codes its products default to. Null until the supplier fills it.
     */
    /** As saved, possibly before later fields existed: read it with `readSupplierFiscalProfile`. */
    fiscalProfile: jsonb().$type<SupplierFiscalProfileInput>(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("suppliers_state_idx").on(table.state),
    uniqueIndex("suppliers_organization_id_unique").on(table.organizationId),
    uniqueIndex("suppliers_owner_tenant_id_unique").on(table.ownerTenantId),
    check(
      "suppliers_catalog_owner_check",
      sql`(${table.catalogKind} = 'supplier' and ${table.ownerTenantId} is null) or (${table.catalogKind} = 'seller' and ${table.ownerTenantId} is not null and ${table.organizationId} is null)`,
    ),
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
    /** NCM, origin, unit, CEST, net weight and tax-code overrides; read with `readProductFiscal`. */
    fiscal: jsonb().$type<ProductFiscalPatch>().notNull().default({}),
    /**
     * Whether publishing needs NCM, origin and unit. False for products that existed before the
     * fiscal fields (they keep selling while the supplier completes them); the panel, the admin
     * form, the spreadsheet and the ERP import set it on every product they create.
     */
    fiscalRequired: boolean().notNull().default(false),
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
