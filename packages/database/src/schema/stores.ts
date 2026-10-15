import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";
import { marketplaceEnum, storeConnectionStatusEnum } from "./enums.ts";
import { suppliers } from "./suppliers.ts";

export const storeConnections = pgTable(
  "store_connections",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    marketplace: marketplaceEnum().notNull(),
    externalShopId: text().notNull(),
    shopName: text().notNull(),
    /**
     * Each shop sells a single supplier's products. Null while pending: shops connected before
     * the rule whose listings mixed suppliers, or whose supplier was deleted.
     */
    supplierId: uuid().references(() => suppliers.id, { onDelete: "set null" }),
    /** AES-256-GCM ciphertext (see packages/shared/src/runtime/token-cipher.ts). */
    accessTokenEnc: text(),
    refreshTokenEnc: text(),
    expiresAt: timestamp({ withTimezone: true }),
    status: storeConnectionStatusEnum().notNull().default("connected"),
    lastError: text(),
    connectedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("store_connections_tenant_idx").on(table.tenantId),
    /** The foreign key, and the supplier's "linked shops" count. */
    index("store_connections_supplier_idx").on(table.supplierId),
    uniqueIndex("store_connections_shop_idx").on(
      table.tenantId,
      table.marketplace,
      table.externalShopId,
    ),
    /**
     * One marketplace shop belongs to one organization at a time: a second organization
     * connecting it would split its orders (and the buyers' data) between both.
     */
    uniqueIndex("store_connections_live_shop_idx")
      .on(table.marketplace, table.externalShopId)
      .where(sql`${table.status} <> 'disconnected'`),
  ],
);

/** Short-lived OAuth state to protect the callback against CSRF and replay. */
export const oauthStates = pgTable("oauth_states", {
  state: text().primaryKey(),
  tenantId: text()
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  marketplace: marketplaceEnum().notNull(),
  codeVerifier: text(),
  /** The supplier picked before connecting; the shop created at the callback sells it. */
  supplierId: uuid().references(() => suppliers.id, { onDelete: "set null" }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});
