import { index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { customerIssueKindEnum } from "./enums.ts";

/**
 * How the admin team is handling one kind of problem of one customer: who took it and until
 * when it is snoozed. Problems themselves are derived from live data; this only keeps the
 * team's decisions about them.
 */
export const customerIssueTriage = pgTable(
  "customer_issue_triage",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    issueKind: customerIssueKindEnum().notNull(),
    assigneeId: text().references(() => user.id, { onDelete: "set null" }),
    snoozedUntil: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.issueKind] })],
);

/**
 * Everything the team did on the platform: to a customer's account (newest first in the
 * customer's timeline) or to something else, like the supplier catalog (item 28.b). The trail
 * outlives the account it is about: deleting the customer only clears `userId`.
 */
export const adminAuditEvents = pgTable(
  "admin_audit_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    adminId: text().references(() => user.id, { onDelete: "set null" }),
    /** The customer acted on; null for platform changes (catalog) or a deleted account. */
    userId: text().references(() => user.id, { onDelete: "set null" }),
    /** What else was changed, when it is not a customer account ("supplier", "product"). */
    entityType: text(),
    entityId: text(),
    action: text().notNull(),
    details: jsonb().$type<Record<string, string | number | boolean | null>>(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("admin_audit_events_user_idx").on(table.userId, table.createdAt),
    index("admin_audit_events_created_idx").on(table.createdAt),
  ],
);

/**
 * When each user last used the app themself. Sessions expire and get cleaned up, so the last
 * sign-in is kept here, outside the auth tables; sessions an admin opens as them do not count.
 */
export const userActivity = pgTable("user_activity", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  lastSeenAt: timestamp({ withTimezone: true }).notNull(),
});
