import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ShipmentPaymentStatus } from "@sellbridge/shared/shipment-payments";
import { user } from "./auth.ts";
import { storeConnectionStatusEnum } from "./enums.ts";
import { orderShipments } from "./fulfillment.ts";
import { suppliers } from "./suppliers.ts";

export const paymentProviderEnum = pgEnum("payment_provider", ["mercado_pago"]);

/**
 * The account a supplier receives payments in (Mercado Pago first), linked by OAuth through
 * SellBridge's marketplace application. The money never passes through SellBridge: the payment
 * is created with the supplier's token and lands in the supplier's own account.
 */
export const supplierPaymentAccounts = pgTable(
  "supplier_payment_accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    provider: paymentProviderEnum().notNull(),
    /** AES-256-GCM ciphertext (see packages/shared/src/runtime/token-cipher.ts). */
    accessTokenEnc: text(),
    refreshTokenEnc: text(),
    expiresAt: timestamp({ withTimezone: true }),
    status: storeConnectionStatusEnum().notNull().default("connected"),
    lastError: text(),
    /** The provider's id of the account (Mercado Pago `user_id`): payment notices name it. */
    providerAccountId: text(),
    /** The supplier member who authorized it, kept for the audit trail. */
    connectedByUserId: text().references(() => user.id, { onDelete: "set null" }),
    connectedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("supplier_payment_accounts_supplier_provider_idx").on(
      table.supplierId,
      table.provider,
    ),
    index("supplier_payment_accounts_provider_account_idx").on(
      table.provider,
      table.providerAccountId,
    ),
  ],
);

/** Short-lived OAuth state for a payment account link, against CSRF and replay. */
export const paymentOAuthStates = pgTable("payment_oauth_states", {
  state: text().primaryKey(),
  supplierId: uuid()
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: paymentProviderEnum().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});

/**
 * What the reseller pays the supplier for one parcel, through the provider's checkout with the
 * marketplace split. One row per parcel: a new checkout replaces the pending preference.
 */
export const shipmentPayments = pgTable(
  "shipment_payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    shipmentId: uuid()
      .notNull()
      .references(() => orderShipments.id, { onDelete: "cascade" }),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    provider: paymentProviderEnum().notNull(),
    status: text().$type<ShipmentPaymentStatus>().notNull().default("pending"),
    /** The amount the reseller pays, in cents. */
    amountCents: integer().notNull(),
    /** SellBridge's share of it (the marketplace fee), in cents. */
    platformFeeCents: integer().notNull(),
    /** The fee rate the share was computed with, in basis points (500 = 5%). */
    platformFeeBasisPoints: integer().notNull(),
    preferenceId: text(),
    providerPaymentId: text(),
    /** The provider's payment type (`pix`, `credit_card`...), once a payment exists. */
    paymentMethod: text(),
    paidAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("shipment_payments_shipment_idx").on(table.shipmentId),
    uniqueIndex("shipment_payments_provider_payment_idx").on(
      table.provider,
      table.providerPaymentId,
    ),
    check(
      "shipment_payments_status_check",
      sql`${table.status} in ('pending','in_process','approved','rejected','cancelled','refunded','charged_back')`,
    ),
    check("shipment_payments_amount_check", sql`${table.amountCents} > 0`),
    check(
      "shipment_payments_fee_check",
      sql`${table.platformFeeCents} >= 0 and ${table.platformFeeCents} <= ${table.amountCents}`,
    ),
  ],
);

/**
 * Platform-wide values the admin edits on the settings screen: a single row (id 1). A null
 * value means it was never set.
 */
export const platformSettings = pgTable(
  "platform_settings",
  {
    id: smallint().primaryKey().default(1),
    /** SellBridge's share of each supplier payment, in basis points (500 = 5%). */
    paymentFeeBasisPoints: integer(),
    updatedByUserId: text().references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("platform_settings_single_row_check", sql`${table.id} = 1`),
    check(
      "platform_settings_payment_fee_check",
      sql`${table.paymentFeeBasisPoints} is null or (${table.paymentFeeBasisPoints} >= 0 and ${table.paymentFeeBasisPoints} <= 3000)`,
    ),
  ],
);
