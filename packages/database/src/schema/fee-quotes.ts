import { integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { storeConnections } from "./stores.ts";

/**
 * What a marketplace last answered for one of a store's sale costs (a category's commission, the
 * shipping of a package in a price band), so the price screens do not ask again for a day and
 * can still count on it for a week when the marketplace does not answer.
 */
export const marketplaceFeeQuotes = pgTable(
  "marketplace_fee_quotes",
  {
    storeConnectionId: uuid()
      .notNull()
      .references(() => storeConnections.id, { onDelete: "cascade" }),
    /** What was asked, e.g. `commission:MLB1234` or `shipping:10x15x20,450:4899`. */
    quoteKey: text().notNull(),
    /** Basis points for a commission, cents for a shipping cost. */
    amount: integer().notNull(),
    readAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.storeConnectionId, table.quoteKey] })],
);
