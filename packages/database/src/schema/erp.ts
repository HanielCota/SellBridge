import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { erpProviderEnum, storeConnectionStatusEnum } from "./enums.ts";
import { suppliers } from "./suppliers.ts";

/**
 * A supplier's ERP account (Bling first), connected by OAuth. Owned by the supplier, not by a
 * reseller's store: it imports the supplier's catalog and will later issue its invoices.
 */
export const supplierErpConnections = pgTable(
  "supplier_erp_connections",
  {
    id: uuid().primaryKey().defaultRandom(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    provider: erpProviderEnum().notNull(),
    /** AES-256-GCM ciphertext (see packages/shared/src/runtime/token-cipher.ts). */
    accessTokenEnc: text(),
    refreshTokenEnc: text(),
    expiresAt: timestamp({ withTimezone: true }),
    status: storeConnectionStatusEnum().notNull().default("connected"),
    lastError: text(),
    /** The supplier member who authorized it, kept for the audit trail. */
    connectedByUserId: text().references(() => user.id, { onDelete: "set null" }),
    connectedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("supplier_erp_connections_supplier_provider_idx").on(
      table.supplierId,
      table.provider,
    ),
    /** The refresh job reads connected rows by expiry. */
    index("supplier_erp_connections_expiry_idx").on(table.status, table.expiresAt),
  ],
);

/** Short-lived OAuth state for an ERP connection, against CSRF and replay. */
export const erpOAuthStates = pgTable("erp_oauth_states", {
  state: text().primaryKey(),
  supplierId: uuid()
    .notNull()
    .references(() => suppliers.id, { onDelete: "cascade" }),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: erpProviderEnum().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});
