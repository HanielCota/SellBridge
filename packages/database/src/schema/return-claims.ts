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
import type { ReturnClaimStatus } from "@sellbridge/shared/return-claims";
import { organization, user } from "./auth.ts";
import { orderShipments } from "./fulfillment.ts";
import { orders } from "./orders.ts";
import { suppliers } from "./suppliers.ts";
import { tickets } from "./support.ts";

/**
 * A returned parcel's claim with its supplier: the support ticket where the supplier sends
 * photos, and the team's decision on crediting the reseller the supplier cost it paid.
 * A credit is a recorded balance only: no Stripe charge or payout moves the money yet.
 */
export const returnClaims = pgTable(
  "return_claims",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** One claim per returned parcel: a retried tracking job never opens a second one. */
    shipmentId: uuid()
      .notNull()
      .references(() => orderShipments.id, { onDelete: "cascade" }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** The reseller who sold the order and is owed the credit. */
    sellerTenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    /** Null only when no one could be named as the ticket's requester. */
    ticketId: uuid().references(() => tickets.id, { onDelete: "set null" }),
    status: text().$type<ReturnClaimStatus>().notNull().default("in_review"),
    /** What the reseller paid the supplier for the returned items: the most it can get back. */
    supplierCostCents: integer().notNull(),
    creditedCents: integer(),
    refusalReason: text(),
    decidedById: text().references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("return_claims_shipment_idx").on(table.shipmentId),
    uniqueIndex("return_claims_ticket_idx").on(table.ticketId),
    index("return_claims_seller_order_idx").on(table.sellerTenantId, table.orderId),
    check("return_claims_status_check", sql`${table.status} in ('in_review','credited','refused')`),
    check(
      "return_claims_credit_check",
      sql`${table.supplierCostCents} >= 0 and (${table.creditedCents} is null or ${table.creditedCents} between 1 and ${table.supplierCostCents})`,
    ),
  ],
);
