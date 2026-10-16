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
import { listingTargetStatusEnum } from "./enums.ts";
import { storeConnections } from "./stores.ts";
import { supplierProducts } from "./suppliers.ts";

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
