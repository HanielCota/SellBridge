import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
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
  lastEventCreated: integer("last_event_created").notNull().default(0),
});

export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
