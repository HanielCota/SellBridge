import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";
import { marketplaceEnum, storeConnectionStatusEnum } from "./enums.ts";

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
    uniqueIndex("store_connections_shop_idx").on(
      table.tenantId,
      table.marketplace,
      table.externalShopId,
    ),
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
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});
