import { sql } from "drizzle-orm";
import type { InvoiceRecipient, InvoiceStatus } from "@sellbridge/shared/supplier-invoice";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { erpCatalogReadStatusEnum, erpProviderEnum, storeConnectionStatusEnum } from "./enums.ts";
import { orderShipments } from "./fulfillment.ts";
import { suppliers } from "./suppliers.ts";

/**
 * A supplier's ERP account (Bling first), connected by OAuth. Owned by the supplier, not by a
 * reseller's store: it imports the supplier's catalog and will later issue its invoices.
 */
export const supplierErpConnections = pgTable(
  "supplier_erp_connections",
  {
    id: uuid().primaryKey().defaultRandom(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    provider: erpProviderEnum().notNull(),
    /** AES-256-GCM ciphertext (see packages/shared/src/runtime/token-cipher.ts). */
    accessTokenEnc: text(),
    refreshTokenEnc: text(),
    expiresAt: timestamp({ withTimezone: true }),
    status: storeConnectionStatusEnum().notNull().default("connected"),
    lastError: text(),
    /** The ERP account's company name, shown on the connection card; null when not read. */
    accountName: text(),
    /**
     * The discount the supplier applies to the ERP price to get the reseller price of new
     * products, in tenths of a percent (300 = 30%); null until the first import with a rule.
     */
    resellerDiscountTenths: integer(),
    lastImportAt: timestamp({ withTimezone: true }),
    /**
     * Since when the ERP issues the NF-e of this supplier's new parcels; null while it is off.
     * Parcels created before it are never invoiced here.
     */
    invoiceEnabledAt: timestamp({ withTimezone: true }),
    /** Who the NF-e is made out to; a setting while the accountant confirms it. */
    invoiceRecipient: text().$type<InvoiceRecipient>().notNull().default("buyer"),
    /** The supplier member who authorized it, kept for the audit trail. */
    connectedByUserId: text().references(() => user.id, { onDelete: "set null" }),
    connectedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("supplier_erp_connections_supplier_provider_idx").on(
      table.supplierId,
      table.provider,
    ),
    /** The refresh job reads connected rows by expiry. */
    index("supplier_erp_connections_expiry_idx").on(table.status, table.expiresAt),
    check(
      "supplier_erp_connections_invoice_recipient_check",
      sql`${table.invoiceRecipient} in ('buyer','reseller')`,
    ),
  ],
);

/** Short-lived OAuth state for an ERP connection, against CSRF and replay. */
export const erpOAuthStates = pgTable("erp_oauth_states", {
  state: text().primaryKey(),
  supplierId: uuid()
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: erpProviderEnum().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});

/**
 * The latest read of a supplier's ERP catalog, done by the worker (a large catalog takes minutes
 * at the ERP's rate limit). One per supplier and provider: a new read replaces the old one, and
 * a read past `expiresAt` is treated as gone.
 */
export const erpCatalogReads = pgTable(
  "erp_catalog_reads",
  {
    id: uuid().primaryKey().defaultRandom(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    provider: erpProviderEnum().notNull(),
    status: erpCatalogReadStatusEnum().notNull().default("reading"),
    /** Products to read (parents), known once the ERP's list was walked; null before that. */
    totalProducts: integer(),
    readProducts: integer().notNull().default(0),
    /** The items, skipped products and truncation flag, validated with Zod when read back. */
    result: jsonb(),
    /** A short reason for the supplier when the read failed. */
    error: text(),
    startedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("erp_catalog_reads_supplier_provider_idx").on(table.supplierId, table.provider),
  ],
);

/**
 * The NF-e of one parcel, issued through the supplier's ERP: the ERP's ids of each step (so a
 * retry goes on from where it stopped instead of creating twice), and what the supplier sees.
 */
export const shipmentInvoices = pgTable(
  "shipment_invoices",
  {
    id: uuid().primaryKey().defaultRandom(),
    shipmentId: uuid()
      .notNull()
      .references(() => orderShipments.id, { onDelete: "cascade" }),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    provider: erpProviderEnum().notNull(),
    status: text().$type<InvoiceStatus>().notNull().default("queued"),
    /** The ERP's contact, sale order and note ids, set as each step succeeds. */
    erpContactId: bigint({ mode: "number" }),
    erpOrderId: bigint({ mode: "number" }),
    erpInvoiceId: bigint({ mode: "number" }),
    number: text(),
    series: text(),
    accessKey: text(),
    danfeUrl: text(),
    /** What the supplier must do, in their words, while the status is "attention". */
    problem: text(),
    /** Passing failures in a row; reset when a step succeeds. */
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    authorizedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("shipment_invoices_shipment_idx").on(table.shipmentId),
    /** The job reads the notes due, the oldest first. */
    index("shipment_invoices_due_idx")
      .on(table.nextAttemptAt)
      .where(sql`${table.status} in ('queued','sent')`),
    index("shipment_invoices_supplier_idx").on(table.supplierId),
    check(
      "shipment_invoices_status_check",
      sql`${table.status} in ('queued','sent','authorized','attention','cancelled')`,
    ),
  ],
);
