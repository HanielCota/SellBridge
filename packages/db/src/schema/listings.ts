import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
  (table) => [index("listings_tenant_idx").on(table.tenantId)],
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
    publishedAt: timestamp({ withTimezone: true }),
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
  ],
);
