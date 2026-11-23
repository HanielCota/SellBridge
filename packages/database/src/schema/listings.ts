import { sql } from "drizzle-orm";
import {
  boolean,
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
import { listingTargetStatusEnum } from "./enums.ts";
import { storeConnections } from "./stores.ts";
import { productModels, supplierProducts } from "./suppliers.ts";

/**
 * A reseller's publication of a product grid (product_models): the listings of its combinations,
 * one per colour and size, sold on Mercado Livre as one family (User Products, family_name).
 * Each combination stays an ordinary listing with its own price, stock sync and orders.
 */
export const listingFamilies = pgTable(
  "listing_families",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    modelId: uuid()
      .notNull()
      .references(() => productModels.id, { onDelete: "restrict" }),
    /** The family name the marketplace groups the items by (Mercado Livre's family_name). */
    name: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    /** One family per reseller and grid: publishing the missing sizes later adds to it. */
    uniqueIndex("listing_families_tenant_model_idx").on(table.tenantId, table.modelId),
    /** The foreign key: separating a grid checks whether a reseller sells it as a family. */
    index("listing_families_model_idx").on(table.modelId),
  ],
);

export const listings = pgTable(
  "listings",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    supplierProductId: uuid()
      .notNull()
      .references(() => supplierProducts.id, { onDelete: "restrict" }),
    title: text().notNull(),
    description: text().notNull(),
    priceCents: integer().notNull(),
    /**
     * The grid publication this combination's listing belongs to; null for a plain product.
     * "No action", not "restrict": checked at the end of the statement, so deleting a tenant
     * cascades to its families and listings together, whatever order Postgres removes them in.
     */
    familyId: uuid().references(() => listingFamilies.id, { onDelete: "no action" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("listings_tenant_idx").on(table.tenantId),
    /** "Already published?" per catalog product, and the duplicate check before publishing. */
    index("listings_tenant_product_idx").on(table.tenantId, table.supplierProductId),
    /** The foreign key: deactivating or deleting a product checks its listings. */
    index("listings_product_idx").on(table.supplierProductId),
    index("listings_family_idx").on(table.familyId),
  ],
);

export const listingTargets = pgTable(
  "listing_targets",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    listingId: uuid()
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    storeConnectionId: uuid()
      .notNull()
      .references(() => storeConnections.id, { onDelete: "cascade" }),
    status: listingTargetStatusEnum().notNull().default("pending"),
    /** Durable seller intent, including a marketplace creation already in flight. */
    pauseRequested: boolean().notNull().default(false),
    /**
     * Why the publication is paused (`@sellbridge/shared/listing-pause-reasons`); null while it
     * sells. Text, not an enum, so a new reason needs no migration.
     */
    pauseReason: text(),
    externalId: text(),
    externalUrl: text(),
    errorReason: text(),
    attempts: integer().notNull().default(0),
    idempotencyKey: text().notNull(),
    /** Durable guard against repeating an uncertain non-idempotent item creation. */
    creationStartedAt: timestamp({ withTimezone: true }),
    publishedAt: timestamp({ withTimezone: true }),
    /** Stock and price last sent to the marketplace (used by the sync job). */
    syncedStock: integer(),
    syncedPriceCents: integer(),
    syncedAt: timestamp({ withTimezone: true }),
    /** Last sync attempt (success or failure); failing targets rotate to the back of the queue. */
    syncAttemptedAt: timestamp({ withTimezone: true }),
    /** Error of the last failed sync attempt, cleared on success. */
    syncError: text(),
    /**
     * Why the marketplace did not take the description (the listing is live without it); cleared
     * once it goes through. The sync job retries it a few times, then only the reseller's resend.
     */
    descriptionError: text(),
    descriptionFailedAt: timestamp({ withTimezone: true }),
    descriptionAttempts: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("listing_targets_tenant_idx").on(table.tenantId),
    index("listing_targets_listing_idx").on(table.listingId),
    uniqueIndex("listing_targets_idempotency_idx").on(table.idempotencyKey),
    uniqueIndex("listing_targets_listing_store_idx").on(table.listingId, table.storeConnectionId),
    check("listing_targets_attempts_check", sql`${table.attempts} >= 0`),
    /** Every incoming order maps the marketplace's listing ids of one store to our targets. */
    index("listing_targets_store_external_idx").on(table.storeConnectionId, table.externalId),
  ],
);
