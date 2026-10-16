import { bigint, boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";

export const billingAccounts = pgTable("billing_accounts", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  customerId: text("customer_id").unique(),
  subscriptionId: text("subscription_id").unique(),
  plan: text("plan").notNull().default("free"),
  status: text("status").notNull().default("free"),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  /**
   * Stripe's `event.created`, in Unix seconds. bigint: an int4 overflows on 2038-01-19 and every
   * Stripe webhook would then fail with "integer out of range".
   */
  lastEventCreated: bigint("last_event_created", { mode: "number" }).notNull().default(0),
});

export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
