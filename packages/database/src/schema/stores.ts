import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
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
     * @deprecated Read and write `store_suppliers` instead. Migration 0072 copied it there; the
     * column stays only until every server runs the new code, then a later migration drops it.
     */
    supplierId: uuid().references(() => suppliers.id, { onDelete: "set null" }),
    /** AES-256-GCM ciphertext (see packages/shared/src/runtime/token-cipher.ts). */
    accessTokenEnc: text(),
    refreshTokenEnc: text(),
    expiresAt: timestamp({ withTimezone: true }),
    status: storeConnectionStatusEnum().notNull().default("connected"),
    lastError: text(),
    /** When the marketplace last sent an event about this shop (store health on /lojas). */
    lastWebhookAt: timestamp({ withTimezone: true }),
    /**
     * A channel with no integration (Shopee, TikTok Shop) where the reseller registers sales by
     * hand: no tokens, never synced, not counted as a store on the plan and not listed on /lojas.
     */
    manual: boolean().notNull().default(false),
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

/**
 * The suppliers whose products a shop sells. A shop with no row is pending: connected before the
 * one-supplier rule with listings that mixed suppliers, or every supplier it sold was deleted.
 */
export const storeSuppliers = pgTable(
  "store_suppliers",
  {
    storeConnectionId: uuid()
      .notNull()
      .references(() => storeConnections.id, { onDelete: "cascade" }),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.storeConnectionId, table.supplierId] }),
    /** The foreign key, and the supplier's "linked shops" count. */
    index("store_suppliers_supplier_idx").on(table.supplierId),
  ],
);
