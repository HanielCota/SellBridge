import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";

/**
 * Until when each user has seen the notification center of an organization (any device), and
 * when they last cleared it there: events up to `clearedAt` are no longer listed. Kept per
 * organization, since a user who belongs to two sees different events in each.
 */
export const notificationReads = pgTable(
  "notification_reads",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    seenAt: timestamp({ withTimezone: true }).notNull(),
    clearedAt: timestamp({ withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tenantId] })],
);
