import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { problemAreaEnum, problemServiceEnum } from "./enums.ts";

/**
 * Errors the web app and the worker logged, for the team's "Problemas" page. One row per
 * problem: repeats of the same fingerprint while it is open add to `occurrences`. The ids are
 * kept as text without references: a problem outlives the account, store or listing it was about.
 * Nothing secret or personal is stored (see `problem-capture.ts`).
 */
export const problemEvents = pgTable(
  "problem_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    service: problemServiceEnum().notNull(),
    area: problemAreaEnum().notNull(),
    /** The logger event ("listing.publish_failed"). */
    event: text().notNull(),
    message: text().notNull(),
    fingerprint: text().notNull(),
    tenantId: text(),
    storeConnectionId: text(),
    listingTargetId: text(),
    /** The latest occurrence's log fields, already redacted. */
    context: jsonb().$type<Record<string, unknown>>().notNull(),
    occurrences: integer().notNull().default(1),
    firstSeenAt: timestamp({ withTimezone: true }).notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull(),
    resolvedAt: timestamp({ withTimezone: true }),
    resolvedById: text().references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("problem_events_last_seen_idx").on(table.lastSeenAt, table.id),
    index("problem_events_open_fingerprint_idx")
      .on(table.fingerprint, table.lastSeenAt)
      .where(sql`${table.resolvedAt} is null`),
  ],
);
