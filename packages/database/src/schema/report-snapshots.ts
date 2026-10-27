import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * The numbers of a monthly report, kept the first time they are read after the month closed, so
 * a closed month never changes again (a late refund or a ticket reopened later stays out of it).
 * `scope` says whose report it is ("seller", "supplier", "admin") and `ownerId` which tenant or
 * supplier; the platform report uses "platform".
 */
export const reportSnapshots = pgTable(
  "report_snapshots",
  {
    id: uuid().primaryKey().defaultRandom(),
    scope: text().notNull(),
    ownerId: text().notNull(),
    /** `YYYY-MM`, in Brazil time. */
    month: text().notNull(),
    /** The report as the page draws it; its shape is versioned inside the payload. */
    payload: jsonb().$type<unknown>().notNull(),
    capturedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("report_snapshots_owner_month_idx").on(table.scope, table.ownerId, table.month),
  ],
);
