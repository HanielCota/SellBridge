import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  SUPPLIER_FLAG_NOTE_MAX_LENGTH,
  SUPPLIER_FLAG_REASONS,
  SUPPLIER_FLAG_VALIDITY_DAYS,
} from "@sellbridge/shared/supplier-flags";
import { user } from "./auth.ts";
import { suppliers } from "./suppliers.ts";

const REASONS_SQL = sql.raw(SUPPLIER_FLAG_REASONS.map((reason) => `'${reason}'`).join(", "));
const NOTE_MAX_SQL = sql.raw(String(SUPPLIER_FLAG_NOTE_MAX_LENGTH));
// In hours, not days: "+ 90 days" on a timestamptz follows the session time zone's daylight saving
// changes, while the app counts 90 × 24 hours (supplierFlagExpiresAt).
const VALIDITY_SQL = sql.raw(`interval '${SUPPLIER_FLAG_VALIDITY_DAYS * 24} hours'`);

/**
 * A flag the team applied to a supplier by hand (MVP function 6). It counts for 90 days from
 * `created_at` unless revoked; see shared/domain/supplier-flags.ts. The supplier sees the reason,
 * the note and the dates, never who applied it nor the revoke note.
 */
export const supplierFlags = pgTable(
  "supplier_flags",
  {
    id: uuid().primaryKey().defaultRandom(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    reason: text({ enum: SUPPLIER_FLAG_REASONS }).notNull(),
    note: text().notNull().default(""),
    /** Who applied it; kept as null if that team member's account is deleted. */
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    revokedBy: text().references(() => user.id, { onDelete: "set null" }),
    revokeNote: text(),
  },
  (table) => [
    index("supplier_flags_supplier_expires_idx").on(table.supplierId, table.expiresAt),
    check("supplier_flags_reason_check", sql`${table.reason} in (${REASONS_SQL})`),
    check(
      "supplier_flags_note_check",
      sql`char_length(${table.note}) <= ${NOTE_MAX_SQL} and (${table.reason} <> 'other' or btrim(${table.note}) <> '')`,
    ),
    check(
      "supplier_flags_expires_check",
      sql`${table.expiresAt} = ${table.createdAt} + ${VALIDITY_SQL}`,
    ),
    check(
      "supplier_flags_revoke_check",
      sql`(${table.revokedAt} is null and ${table.revokeNote} is null) or (${table.revokedAt} is not null and ${table.revokeNote} is not null and btrim(${table.revokeNote}) <> '' and char_length(${table.revokeNote}) <= ${NOTE_MAX_SQL})`,
    ),
  ],
);
