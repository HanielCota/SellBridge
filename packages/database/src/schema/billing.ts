import { sql } from "drizzle-orm";
import { bigint, boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";

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

export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
