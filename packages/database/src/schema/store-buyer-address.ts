import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { buyerAddressResultEnum } from "./enums.ts";
import { storeConnections } from "./stores.ts";
import { suppliers } from "./suppliers.ts";

/**
 * The last check of whether a store's marketplace account buys at its supplier's address. Only
 * the verdict is kept: the account's addresses are read, compared and dropped.
 */
export const storeBuyerAddressChecks = pgTable(
  "store_buyer_address_checks",
  {
    storeConnectionId: uuid()
      .primaryKey()
      .references(() => storeConnections.id, { onDelete: "cascade" }),
    result: buyerAddressResultEnum().notNull(),
    /** The supplier whose address the account buys at; only with "supplier_address". */
    supplierId: uuid().references(() => suppliers.id, { onDelete: "set null" }),
    /** When the marketplace was last asked, whether it answered or not. */
    checkedAt: timestamp({ withTimezone: true }).notNull(),
    /** When the purchase address turned out to be a supplier's; kept while it stays wrong. */
    wrongSince: timestamp({ withTimezone: true }),
  },
  (table) => [
    /** The daily check picks the stores checked longest ago. */
    index("store_buyer_address_checks_checked_idx").on(table.checkedAt),
  ],
);
