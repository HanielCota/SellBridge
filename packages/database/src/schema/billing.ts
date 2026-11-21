import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";

export const billingAccounts = pgTable(
  "billing_accounts",
  {
    tenantId: text("tenant_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** The payer at the payment provider (Asaas `cus_...`). */
    customerId: text("customer_id").unique(),
    /** The monthly subscription at the payment provider (Asaas `sub_...`). */
    subscriptionId: text("subscription_id").unique(),
    plan: text("plan").notNull().default("free"),
    status: text("status").notNull().default("free"),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    /**
     * When the applied state was read from the provider, in Unix milliseconds (item 16.a): the
     * newest read wins. bigint: milliseconds do not fit an int4.
     */
    lastEventCreated: bigint("last_event_created", { mode: "number" }).notNull().default(0),
    /** How the monthly fee is paid: Pix every month, or a card that renews by itself. */
    paymentMethod: text("payment_method"),
    /** A smaller plan the reseller chose: it takes over at the next monthly charge. */
    scheduledPlan: text("scheduled_plan"),
    scheduledPlanAt: timestamp("scheduled_plan_at", { withTimezone: true }),
    /** A plan waiting for its first payment or for the upgrade difference to be paid. */
    pendingPlan: text("pending_plan"),
    /** What pays `pendingPlan`: `checkout:<id>` (card) or `charge:<id>` (upgrade difference). */
    pendingReference: text("pending_reference"),
    /**
     * Paid by an earlier subscription (after a payment method change or a new subscription
     * during a canceled, still paid month): the current one starts charging when it ends.
     */
    prepaidUntil: timestamp("prepaid_until", { withTimezone: true }),
    /**
     * The day (Brasília) the account paid its first monthly fee ever: only that fee is given back
     * when the plan is cancelled within 7 days, never a later subscription's first fee.
     */
    firstPaidOn: date("first_paid_on", { mode: "string" }),
  },
  (table) => [
    check(
      "billing_accounts_payment_method_check",
      sql`${table.paymentMethod} is null or ${table.paymentMethod} in ('pix', 'credit_card')`,
    ),
    check(
      "billing_accounts_scheduled_plan_check",
      sql`(${table.scheduledPlan} is null) = (${table.scheduledPlanAt} is null)`,
    ),
  ],
);

/**
 * A plan the team gave the account with no charge. Kept apart from `billing_accounts`, which
 * mirrors the payment provider: nothing read from Asaas ever touches a courtesy. Taking it back
 * deletes the row; who gave, changed or took it, and why, stays in `admin_audit_events`.
 */
export const billingCourtesies = pgTable(
  "billing_courtesies",
  {
    tenantId: text("tenant_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    plan: text("plan").notNull(),
    /** The first moment without the plan; null never runs out. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    reason: text("reason").notNull(),
    grantedBy: text("granted_by").references(() => user.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "billing_courtesies_plan_check",
      sql`${table.plan} in ('start', 'pro', 'business', 'black', 'elite')`,
    ),
  ],
);

export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
