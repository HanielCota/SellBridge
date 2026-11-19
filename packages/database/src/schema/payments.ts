import { sql } from "drizzle-orm";
import {
  boolean,
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
import type {
  ShipmentPaymentRefundReason,
  ShipmentPaymentStatus,
} from "@sellbridge/shared/shipment-payments";
import type { PaymentAccountReviewStatus } from "@sellbridge/shared/payment-accounts";
import { user } from "./auth.ts";
import { storeConnectionStatusEnum } from "./enums.ts";
import { orderShipments } from "./fulfillment.ts";
import { suppliers } from "./suppliers.ts";

export const paymentProviderEnum = pgEnum("payment_provider", ["mercado_pago", "asaas"]);

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
    /** Asaas only: the wallet the supplier receives its share in. */
    walletId: text(),
    /** Asaas only: where Asaas's review of the account documents stands. */
    reviewStatus: text().$type<PaymentAccountReviewStatus>(),
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
    check(
      "supplier_payment_accounts_review_status_check",
      sql`${table.reviewStatus} is null or ${table.reviewStatus} in ('pending','awaiting_approval','approved','rejected')`,
    ),
  ],
);

/**
 * Which linked account a supplier chose to receive new payments in. A payment already open or
 * paid stays with the provider it started on. No row: the only usable account, Mercado Pago
 * first when both are usable.
 */
export const supplierPaymentChoices = pgTable("supplier_payment_choices", {
  supplierId: uuid()
    .primaryKey()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  provider: paymentProviderEnum().notNull(),
  chosenByUserId: text().references(() => user.id, { onDelete: "set null" }),
  chosenAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

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
    /** The open checkout and until when it takes payments: a new click reuses it meanwhile. */
    checkoutUrl: text(),
    checkoutExpiresAt: timestamp({ withTimezone: true }),
    providerPaymentId: text(),
    /** The provider's payment type (`pix`, `credit_card`...), once a payment exists. */
    paymentMethod: text(),
    paidAt: timestamp({ withTimezone: true }),
    /** Last time the reconciliation job read this payment back from the provider. */
    checkedAt: timestamp({ withTimezone: true }),
    /**
     * Why SellBridge gives the reseller's money back (the supplier did not ship in time, or the
     * parcel was cancelled or came back), and when it first asked the provider to.
     */
    refundReason: text().$type<ShipmentPaymentRefundReason>(),
    refundRequestedAt: timestamp({ withTimezone: true }),
    /** The provider refused the refund for good: the team takes it from here. */
    refundFailedAt: timestamp({ withTimezone: true }),
    refundError: text(),
    /**
     * The reseller cancelled after the supplier accepted: no automatic refund, since the supplier
     * may have posted already. The team was alerted at this time and settles it by hand.
     */
    refundHeldAt: timestamp({ withTimezone: true }),
    /**
     * Asaas only: the guarantee holding the money in the supplier's protected account, as last read
     * from Asaas, and when it ends on its own.
     */
    escrowId: text(),
    escrowStatus: text().$type<"active" | "done">(),
    escrowExpiresAt: timestamp({ withTimezone: true }),
    /** When SellBridge asked Asaas to free the money; never asked twice. */
    releaseRequestedAt: timestamp({ withTimezone: true }),
    /** When Asaas confirmed the money went to the supplier. */
    releasedAt: timestamp({ withTimezone: true }),
    /** The team's choice on the Problemas page for a held payment no rule decides. */
    teamDecision: text().$type<"release" | "refund">(),
    teamDecisionAt: timestamp({ withTimezone: true }),
    teamDecisionByUserId: text().references(() => user.id, { onDelete: "set null" }),
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
      "shipment_payments_refund_reason_check",
      sql`${table.refundReason} is null or ${table.refundReason} in ('not_dispatched','cancelled','returned','not_delivered','team')`,
    ),
    // The reconciliation job reads unpaid payments, the least recently checked first.
    index("shipment_payments_reconcile_idx")
      .on(table.checkedAt.asc().nullsFirst())
      .where(sql`${table.status} in ('pending','in_process','rejected','cancelled')`),
    // The refund job reads paid parcels it has not given up on, the oldest payment first.
    index("shipment_payments_refund_idx")
      .on(table.paidAt)
      .where(
        sql`${table.status} = 'approved' and ${table.refundFailedAt} is null and ${table.refundHeldAt} is null`,
      ),
    check(
      "shipment_payments_escrow_status_check",
      sql`${table.escrowStatus} is null or ${table.escrowStatus} in ('active','done')`,
    ),
    check(
      "shipment_payments_team_decision_check",
      sql`${table.teamDecision} is null or ${table.teamDecision} in ('release','refund')`,
    ),
    // The escrow job (`listHeldPayments`) reads paid parcels not yet released nor given up on,
    // the least recently checked first. Not filtered on provider: 'asaas' joins the enum in the
    // same migration, and Postgres refuses a new enum value inside that transaction.
    index("shipment_payments_held_idx")
      .on(table.checkedAt.asc().nullsFirst(), table.id)
      .where(
        sql`${table.status} in ('approved','charged_back') and ${table.releasedAt} is null and ${table.refundFailedAt} is null`,
      ),
    check(
      "shipment_payments_fee_check",
      sql`${table.platformFeeCents} >= 0 and ${table.platformFeeCents} <= ${table.amountCents}`,
    ),
  ],
);

/**
 * Every checkout SellBridge opened for a parcel payment, with what it charged: a payment made
 * through an older checkout (approved after the reseller opened a new one) is still recognized,
 * as long as it matches that checkout's amount and fee.
 */
export const shipmentPaymentCheckouts = pgTable(
  "shipment_payment_checkouts",
  {
    id: uuid().primaryKey().defaultRandom(),
    shipmentPaymentId: uuid()
      .notNull()
      .references(() => shipmentPayments.id, { onDelete: "cascade" }),
    preferenceId: text().notNull(),
    amountCents: integer().notNull(),
    platformFeeCents: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("shipment_payment_checkouts_preference_idx").on(table.preferenceId),
    index("shipment_payment_checkouts_payment_idx").on(table.shipmentPaymentId, table.createdAt),
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
    /**
     * While on, a supplier with fewer than `newSupplierDeliveries` confirmed deliveries receives
     * only through Asaas, with the money held until delivery. Off by default (Guilherme, 15/11/2026).
     */
    newSupplierProtection: boolean().notNull().default(false),
    newSupplierDeliveries: integer().notNull().default(5),
    /** Business days a supplier has to check a returned product when the marketplace gives no date. */
    returnAnswerBusinessDays: integer().notNull().default(3),
    updatedByUserId: text().references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("platform_settings_single_row_check", sql`${table.id} = 1`),
    check(
      "platform_settings_new_supplier_deliveries_check",
      sql`${table.newSupplierDeliveries} between 1 and 1000`,
    ),
    check(
      "platform_settings_payment_fee_check",
      sql`${table.paymentFeeBasisPoints} is null or (${table.paymentFeeBasisPoints} >= 0 and ${table.paymentFeeBasisPoints} <= 3000)`,
    ),
    check(
      "platform_settings_return_answer_days_check",
      sql`${table.returnAnswerBusinessDays} between 1 and 5`,
    ),
  ],
);
