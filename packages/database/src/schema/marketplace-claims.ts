import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";
import { marketplaceEnum } from "./enums.ts";
import { orders } from "./orders.ts";
import { storeConnections } from "./stores.ts";

/**
 * A buyer's claim (and its return) as the marketplace last reported it. Shown, never resolved
 * here: the reseller answers it on the marketplace. Not the supplier credit of `return_claims`.
 */
export const marketplaceClaims = pgTable(
  "marketplace_claims",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    storeConnectionId: uuid()
      .notNull()
      .references(() => storeConnections.id, { onDelete: "cascade" }),
    marketplace: marketplaceEnum().notNull(),
    externalClaimId: text().notNull(),
    status: text().$type<"opened" | "closed">().notNull(),
    /** The marketplace's own words (type, stage, reason, resolution), kept as they come. */
    type: text().notNull(),
    stage: text().notNull(),
    reasonId: text(),
    problem: text(),
    actionResponsible: text().$type<"seller" | "buyer" | "mediator">(),
    actionDueAt: timestamp({ withTimezone: true }),
    resolutionReason: text(),
    closedAt: timestamp({ withTimezone: true }),
    returnStatus: text(),
    returnTrackingCode: text(),
    returnDestination: text().$type<"seller" | "marketplace">(),
    moneyStatus: text().$type<"retained" | "refunded" | "available">(),
    openedAt: timestamp({ withTimezone: true }).notNull(),
    /** The marketplace's `last_updated`: an older reading never overwrites a newer one. */
    marketplaceUpdatedAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("marketplace_claims_external_idx").on(table.marketplace, table.externalClaimId),
    index("marketplace_claims_tenant_order_idx").on(table.tenantId, table.orderId),
    // The order lists flag orders with an open claim.
    index("marketplace_claims_open_idx")
      .on(table.tenantId, table.orderId)
      .where(sql`${table.status} = 'opened'`),
    check("marketplace_claims_status_check", sql`${table.status} in ('opened','closed')`),
  ],
);
