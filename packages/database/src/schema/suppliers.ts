import type { WarrantyType } from "@sellbridge/shared/product-sale-terms";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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
import { SUPPLIER_APPROVAL_STATUSES } from "@sellbridge/shared/supplier-approval";
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
     * Whether resellers may see the supplier at all. A supplier who signs up alone starts
     * `pending` until the automatic check or the team decides (supplier_approvals); team-created
     * suppliers start `approved`. Independent of `active`, which the team switches off later.
     */
    approvalStatus: text({ enum: SUPPLIER_APPROVAL_STATUSES }).notNull().default("approved"),
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
      "suppliers_approval_status_check",
      sql`${table.approvalStatus} in ('pending','approved','refused')`,
    ),
    // The approval round reads the few suppliers not yet approved.
    index("suppliers_pending_approval_idx")
      .on(table.createdAt)
      .where(sql`${table.approvalStatus} = 'pending'`),
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

/**
 * A product sold in a grid of colours and sizes (decision 2026-11-18). It owns what every
 * combination shares; each combination is a `supplier_products` row (the unit that carries the
 * SKU, stock, reservations, orders and invoices), whose shared columns are rewritten from here.
 */
export const productModels = pgTable(
  "product_models",
  {
    id: uuid().primaryKey().defaultRandom(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    /**
     * The supplier's own code for the model (the spreadsheet's "codigo_modelo"); one per supplier.
     * A grid typed in the form gets one from its title.
     */
    code: text().notNull(),
    title: text().notNull(),
    description: text().notNull().default(""),
    /** Photos for combinations whose colour has none of its own. */
    imageUrls: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Attributes every combination shares (brand, model, gender); never GTIN. */
    mercadoLivreAttributes: jsonb().$type<Record<string, string>>().notNull().default({}),
    mercadoLivreCategoryId: text(),
    mercadoLivreCategoryName: text(),
    warrantyType: text().$type<WarrantyType>(),
    warrantyDays: integer(),
    videoUrl: text(),
    madeToOrderDays: integer(),
    carrierOnly: boolean().notNull().default(false),
    /** Fiscal fields every combination inherits unless it overrides them. */
    fiscal: jsonb().$type<ProductFiscalPatch>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("product_models_supplier_idx").on(table.supplierId),
    /** Lets a combination's foreign key also prove it belongs to the model's supplier. */
    uniqueIndex("product_models_id_supplier_idx").on(table.id, table.supplierId),
    uniqueIndex("product_models_supplier_code_idx").on(table.supplierId, table.code),
    check(
      "product_models_sale_terms_check",
      sql`(${table.warrantyType} is null or ${table.warrantyType} in ('none', 'seller', 'factory')) and (${table.warrantyDays} is null or ${table.warrantyDays} between 1 and 3650) and (${table.madeToOrderDays} is null or ${table.madeToOrderDays} between 1 and 60)`,
    ),
  ],
);

/** A model's colours in the order the buyer sees them, each with its own photos. */
export const productModelColors = pgTable(
  "product_model_colors",
  {
    modelId: uuid()
      .notNull()
      .references(() => productModels.id, { onDelete: "cascade" }),
    name: text().notNull(),
    position: integer().notNull(),
    imageUrls: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (table) => [primaryKey({ columns: [table.modelId, table.name] })],
);

/** A model's sizes in the order the buyer sees them. */
export const productModelSizes = pgTable(
  "product_model_sizes",
  {
    modelId: uuid()
      .notNull()
      .references(() => productModels.id, { onDelete: "cascade" }),
    name: text().notNull(),
    position: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.modelId, table.name] })],
);

export const supplierProducts = pgTable(
  "supplier_products",
  {
    id: uuid().primaryKey().defaultRandom(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    /** The grid this row is a combination of; null for a product without colours or sizes. */
    modelId: uuid(),
    color: text(),
    size: text(),
    /** This combination's own Mercado Livre attributes (GTIN), laid over the model's. */
    variantAttributes: jsonb().$type<Record<string, string>>().notNull().default({}),
    /** This combination's own fiscal fields (weight), laid over the model's. */
    variantFiscal: jsonb().$type<ProductFiscalPatch>().notNull().default({}),
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
    /**
     * The product (or variation) id in the supplier's ERP, matched by SKU; null while it is not
     * found there. A linked product's stock follows the ERP (Bling stock sync).
     */
    erpProductId: bigint({ mode: "number" }),
    /** When the ERP stock now in `stock` was read; an older read never overwrites a newer one. */
    erpStockReadAt: timestamp({ withTimezone: true }),
    imageUrls: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    mercadoLivreAttributes: jsonb().$type<Record<string, string>>().notNull().default({}),
    /** Mercado Livre category the supplier confirmed (MLB…); null: predicted from the title. */
    mercadoLivreCategoryId: text(),
    /** Its name as Mercado Livre gave it, so the form shows it without asking again. */
    mercadoLivreCategoryName: text(),
    /** "none", "seller" or "factory" (shared/domain/product-sale-terms.ts); null: not said. */
    warrantyType: text().$type<WarrantyType>(),
    warrantyDays: integer(),
    /** A YouTube link; Mercado Livre receives its video id. */
    videoUrl: text(),
    /** Days to make the product after a sale; null when it ships from stock. */
    madeToOrderDays: integer(),
    /** Too big or heavy for the post office: only a carrier takes it. */
    carrierOnly: boolean().notNull().default(false),
    /** NCM, origin, unit, CEST, net weight and tax-code overrides; read with `readProductFiscal`. */
    fiscal: jsonb().$type<ProductFiscalPatch>().notNull().default({}),
    /**
     * Whether publishing needs NCM, origin and unit. False for products that existed before the
     * fiscal fields (they keep selling while the supplier completes them); the panel, the admin
     * form, the spreadsheet and the ERP import set it on every product they create.
     */
    fiscalRequired: boolean().notNull().default(false),
    /**
     * Whether publishing needs a weight (packed, else net) for the shipping estimate. False for
     * products that existed before the rule: they keep selling on the 0,5 kg estimate while the
     * supplier fills it in. Every path that creates a supplier's product sets it.
     */
    weightRequired: boolean().notNull().default(false),
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
    /** The stock sync finds a supplier's product by its ERP id. */
    index("supplier_products_erp_product_idx")
      .on(table.supplierId, table.erpProductId)
      .where(sql`${table.erpProductId} is not null`),
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
    foreignKey({
      name: "supplier_products_model_fk",
      columns: [table.modelId, table.supplierId],
      foreignColumns: [productModels.id, productModels.supplierId],
    }).onDelete("no action"),
    foreignKey({
      name: "supplier_products_model_color_fk",
      columns: [table.modelId, table.color],
      foreignColumns: [productModelColors.modelId, productModelColors.name],
    })
      .onUpdate("cascade")
      .onDelete("no action"),
    foreignKey({
      name: "supplier_products_model_size_fk",
      columns: [table.modelId, table.size],
      foreignColumns: [productModelSizes.modelId, productModelSizes.name],
    })
      .onUpdate("cascade")
      .onDelete("no action"),
    /** One row per colour and size of a model (a grid may have only colours or only sizes). */
    uniqueIndex("supplier_products_model_combination_idx")
      .on(table.modelId, sql`coalesce(${table.color}, '')`, sql`coalesce(${table.size}, '')`)
      .where(sql`${table.modelId} is not null`),
    check(
      "supplier_products_model_combination_check",
      sql`(${table.modelId} is null and ${table.color} is null and ${table.size} is null and ${table.variantAttributes} = '{}'::jsonb and ${table.variantFiscal} = '{}'::jsonb) or (${table.modelId} is not null and (${table.color} is not null or ${table.size} is not null))`,
    ),
    check(
      "supplier_products_sale_terms_check",
      sql`(${table.warrantyType} is null or ${table.warrantyType} in ('none', 'seller', 'factory')) and (${table.warrantyDays} is null or ${table.warrantyDays} between 1 and 3650) and (${table.madeToOrderDays} is null or ${table.madeToOrderDays} between 1 and 60)`,
    ),
  ],
);

/**
 * A supplier grouping products they already had into one grid (decision of 20/11/2026). The
 * products keep their ids, so listings and orders never notice; separating restores them.
 */
export const productGroupings = pgTable(
  "product_groupings",
  {
    id: uuid().primaryKey().defaultRandom(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    /** Null once separated: the model is deleted, the record stays as the audit trail. */
    modelId: uuid().references(() => productModels.id, { onDelete: "set null" }),
    /** The user who grouped (the supplier, or the team acting as the supplier); no FK, like reviews. */
    groupedBy: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    separatedAt: timestamp({ withTimezone: true }),
    separatedBy: text(),
  },
  (table) => [
    index("product_groupings_supplier_idx").on(table.supplierId),
    /** A model comes from one grouping at most while it exists. */
    uniqueIndex("product_groupings_model_idx")
      .on(table.modelId)
      .where(sql`${table.modelId} is not null`),
    check(
      "product_groupings_separated_check",
      sql`(${table.separatedAt} is null) = (${table.separatedBy} is null)`,
    ),
  ],
);

/**
 * Each grouped product as it was before: what the grid rewrote (name, description, photos, sheet,
 * fiscal, category and sale terms). Stock, cost and price are not kept: they change for real.
 */
export const productGroupingItems = pgTable(
  "product_grouping_items",
  {
    groupingId: uuid()
      .notNull()
      .references(() => productGroupings.id, { onDelete: "cascade" }),
    supplierProductId: uuid().notNull(),
    title: text().notNull(),
    description: text().notNull(),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    imageUrls: text().array().notNull(),
    mercadoLivreAttributes: jsonb().$type<Record<string, string>>().notNull(),
    mercadoLivreCategoryId: text(),
    mercadoLivreCategoryName: text(),
    warrantyType: text().$type<WarrantyType>(),
    warrantyDays: integer(),
    videoUrl: text(),
    madeToOrderDays: integer(),
    carrierOnly: boolean().notNull(),
    fiscal: jsonb().$type<ProductFiscalPatch>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupingId, table.supplierProductId] }),
    // Named by hand: the generated name has 66 characters and Postgres keeps only 63.
    foreignKey({
      name: "product_grouping_items_product_fk",
      columns: [table.supplierProductId],
      foreignColumns: [supplierProducts.id],
    }).onDelete("cascade"),
    /** The foreign key: deleting a product checks its grouping records. */
    index("product_grouping_items_product_idx").on(table.supplierProductId),
  ],
);
