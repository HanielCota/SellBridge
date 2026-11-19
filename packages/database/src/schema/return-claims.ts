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
import type { ReturnClaimStatus } from "@sellbridge/shared/return-claims";
import type {
  CloseReason,
  ReturnDestination,
  ReturnReason,
  ReturnStep,
  SupplierVerdict,
} from "@sellbridge/shared/return-policy";
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
    /**
     * Where the return policy stands. Null for claims opened before the policy and for suppliers
     * the team still runs: the team decides those, as before.
     */
    policyStep: text().$type<ReturnStep>(),
    destination: text().$type<ReturnDestination>(),
    /** Why the buyer sent it back, as the reseller tells it. */
    reason: text().$type<ReturnReason>(),
    reasonNote: text(),
    /** What the marketplace charged the store for the return label. */
    returnShippingCents: integer(),
    reasonStatedAt: timestamp({ withTimezone: true }),
    /** The parcel reached the address the marketplace sent it to. */
    arrivedAt: timestamp({ withTimezone: true }),
    forwardDueAt: timestamp({ withTimezone: true }),
    forwardedAt: timestamp({ withTimezone: true }),
    forwardTrackingCode: text(),
    supplierReceivedAt: timestamp({ withTimezone: true }),
    /** The marketplace's own review date, when it gives one. */
    marketplaceDueAt: timestamp({ withTimezone: true }),
    supplierDueAt: timestamp({ withTimezone: true }),
    supplierVerdict: text().$type<SupplierVerdict>(),
    supplierCondition: text(),
    supplierResellable: boolean(),
    supplierAnsweredAt: timestamp({ withTimezone: true }),
    closeReason: text().$type<CloseReason>(),
    closedAt: timestamp({ withTimezone: true }),
    /** The return label the supplier owes on top of the cost; recorded only, not paid yet. */
    supplierOwesShippingCents: integer(),
    /** Set once: the units went back on the supplier's shelf. */
    stockReturnedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("return_claims_shipment_idx").on(table.shipmentId),
    index("return_claims_policy_step_idx").on(table.policyStep),
    uniqueIndex("return_claims_ticket_idx").on(table.ticketId),
    index("return_claims_seller_order_idx").on(table.sellerTenantId, table.orderId),
    check("return_claims_status_check", sql`${table.status} in ('in_review','credited','refused')`),
    check(
      "return_claims_credit_check",
      sql`${table.supplierCostCents} >= 0 and (${table.creditedCents} is null or ${table.creditedCents} between 1 and ${table.supplierCostCents})`,
    ),
    check(
      "return_claims_policy_step_check",
      sql`${table.policyStep} is null or ${table.policyStep} in ('awaiting_supplier','awaiting_forward','forwarded','disputed','closed')`,
    ),
    check(
      "return_claims_destination_check",
      sql`${table.destination} is null or ${table.destination} in ('supplier','seller')`,
    ),
    check(
      "return_claims_reason_check",
      sql`${table.reason} is null or ${table.reason} in ('defect','damaged','wrong_item','regret','not_delivered')`,
    ),
    check(
      "return_claims_verdict_check",
      sql`${table.supplierVerdict} is null or ${table.supplierVerdict} in ('as_described','not_as_described','not_received')`,
    ),
    check(
      "return_claims_close_reason_check",
      sql`${table.closeReason} is null or ${table.closeReason} in ('supplier_agreed','supplier_silent','team_decided','not_forwarded')`,
    ),
    check(
      "return_claims_shipping_check",
      sql`(${table.returnShippingCents} is null or ${table.returnShippingCents} >= 0) and (${table.supplierOwesShippingCents} is null or ${table.supplierOwesShippingCents} >= 0)`,
    ),
  ],
);

/** Photos of a returned product: the reseller's (why it came back) and the supplier's (how it arrived). */
export const returnClaimPhotos = pgTable(
  "return_claim_photos",
  {
    id: uuid().primaryKey().defaultRandom(),
    claimId: uuid()
      .notNull()
      .references(() => returnClaims.id, { onDelete: "cascade" }),
    side: text().$type<"seller" | "supplier">().notNull(),
    storageKey: text().notNull(),
    fileName: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("return_claim_photos_claim_idx").on(table.claimId),
    check("return_claim_photos_side_check", sql`${table.side} in ('seller','supplier')`),
    check("return_claim_photos_size_check", sql`${table.sizeBytes} >= 0`),
  ],
);
