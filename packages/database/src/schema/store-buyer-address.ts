import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { BUYER_ADDRESS_RELEASE_NOTE_MAX_LENGTH } from "@sellbridge/shared/buyer-address";
import { user } from "./auth.ts";
import { buyerAddressResultEnum } from "./enums.ts";
import { storeConnections } from "./stores.ts";
import { suppliers } from "./suppliers.ts";

const RELEASE_NOTE_MAX_SQL = sql.raw(String(BUYER_ADDRESS_RELEASE_NOTE_MAX_LENGTH));

/**
 * The last check of whether a store's marketplace account buys at its supplier's address. Only
 * the verdict is kept: the account's addresses are read, compared and dropped.
 */
export const storeBuyerAddressChecks = pgTable(
  "store_buyer_address_checks",
  {
    storeConnectionId: uuid().primaryKey(),
    result: buyerAddressResultEnum().notNull(),
    /** The supplier whose address the account buys at; only with "supplier_address". */
    supplierId: uuid().references(() => suppliers.id, { onDelete: "set null" }),
    /** When the marketplace was last asked, whether it answered or not. */
    checkedAt: timestamp({ withTimezone: true }).notNull(),
    /** When the purchase address turned out to be a supplier's; kept while it stays wrong. */
    wrongSince: timestamp({ withTimezone: true }),
    /**
     * When the team found the match a false alarm (the reseller lives in the supplier's building).
     * Kept while the account buys at that same supplier's address; any other verdict clears it.
     */
    releasedAt: timestamp({ withTimezone: true }),
    /** Who released it; kept as null if that team member's account is deleted. */
    releasedBy: text().references(() => user.id, { onDelete: "set null" }),
    releaseNote: text(),
  },
  (table) => [
    /** The daily check picks the stores checked longest ago. */
    index("store_buyer_address_checks_checked_idx").on(table.checkedAt),
    // Named by hand: the generated name passes the 63 characters Postgres keeps.
    foreignKey({
      name: "store_buyer_address_checks_store_connection_fk",
      columns: [table.storeConnectionId],
      foreignColumns: [storeConnections.id],
    }).onDelete("cascade"),
    check(
      "store_buyer_address_checks_release_check",
      sql`(${table.releasedAt} is null and ${table.releaseNote} is null) or (${table.releasedAt} is not null and ${table.result} = 'supplier_address' and ${table.releaseNote} is not null and btrim(${table.releaseNote}) <> '' and char_length(${table.releaseNote}) <= ${RELEASE_NOTE_MAX_SQL})`,
    ),
  ],
);
