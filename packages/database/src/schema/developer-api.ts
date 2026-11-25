import {
  bigserial,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";

/**
 * Keys the SellBridge developers use to read data across every organization from other
 * projects. Separate from `api_keys` (one organization each) on purpose: only accounts listed in
 * `DEVELOPER_EMAILS` may create them. Only the SHA-256 of the secret is stored.
 */
export const developerApiKeys = pgTable(
  "developer_api_keys",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    prefix: text().notNull(),
    secretHash: text().notNull(),
    scopes: text().array().notNull(),
    createdByUserId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastUsedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("developer_api_keys_secret_hash_idx").on(table.secretHash),
    index("developer_api_keys_creator_idx").on(table.createdByUserId, table.createdAt),
  ],
);

/** Requests per developer key and fixed one-minute window, pruned as new windows open. */
export const developerApiRateLimits = pgTable(
  "developer_api_rate_limits",
  {
    keyId: uuid()
      .notNull()
      .references(() => developerApiKeys.id, { onDelete: "cascade" }),
    windowStart: timestamp({ withTimezone: true }).notNull(),
    requests: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.keyId, table.windowStart] })],
);

/**
 * Every call made with a developer key: which operation, on which organization and record, and
 * whether buyer personal data went out. Never the query string, the key or any returned data.
 * The trail outlives the key and its creator: the key id turns null and the prefix stays.
 */
export const developerApiRequests = pgTable(
  "developer_api_requests",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    keyId: uuid().references(() => developerApiKeys.id, { onDelete: "set null" }),
    keyPrefix: text().notNull(),
    operation: text().notNull(),
    status: integer().notNull(),
    durationMilliseconds: integer().notNull(),
    /** No foreign key on purpose: the trail stays after the organization is deleted. */
    organizationId: text(),
    /** The order, ticket, listing, product or supplier id named in the path, when any. */
    resourceId: text(),
    personalData: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("developer_api_requests_key_idx").on(table.keyId, table.createdAt),
    index("developer_api_requests_organization_idx").on(table.organizationId, table.createdAt),
  ],
);
