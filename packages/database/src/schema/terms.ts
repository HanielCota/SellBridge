import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";

/**
 * Each person's acceptance of the terms of use and privacy policy, by version and date (item
 * 26.a, L4). Only inserted: a new version of the terms asks everyone again.
 */
export const termsAcceptances = pgTable(
  "terms_acceptances",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    version: text().notNull(),
    acceptedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  // Leads with user_id: it also serves the foreign key and the per-person lookup.
  (table) => [uniqueIndex("terms_acceptances_user_version_idx").on(table.userId, table.version)],
);
