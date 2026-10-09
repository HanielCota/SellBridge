import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";

/** Until when each user has seen the notification center (per user, any device). */
export const notificationReads = pgTable("notification_reads", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  seenAt: timestamp({ withTimezone: true }).notNull(),
});
