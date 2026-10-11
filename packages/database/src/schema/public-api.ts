import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";
import { webhookDeliveryStatusEnum } from "./enums.ts";

/**
 * Keys other systems use to call the public API on behalf of one organization. Only the
 * SHA-256 of the secret is stored; `prefix` is the visible start of the key, shown in the UI
 * so people can tell their keys apart.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text().notNull(),
    prefix: text().notNull(),
    secretHash: text().notNull(),
    scopes: text().array().notNull(),
    createdByUserId: text().references(() => user.id, { onDelete: "set null" }),
    lastUsedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("api_keys_secret_hash_idx").on(table.secretHash),
    index("api_keys_tenant_idx").on(table.tenantId),
  ],
);

/** Requests per key and fixed one-minute window; old windows are pruned as new ones open. */
export const apiRateLimits = pgTable(
  "api_rate_limits",
  {
    apiKeyId: uuid()
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    windowStart: timestamp({ withTimezone: true }).notNull(),
    requests: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.apiKeyId, table.windowStart] })],
);

/**
 * The first response to each `Idempotency-Key`, replayed when the client sends the same
 * request again. `responseStatus` stays null while the first request is still running.
 */
export const apiIdempotencyKeys = pgTable(
  "api_idempotency_keys",
  {
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    key: text().notNull(),
    requestHash: text().notNull(),
    responseStatus: integer(),
    responseBody: jsonb(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.key] }),
    index("api_idempotency_keys_created_idx").on(table.createdAt),
  ],
);

/**
 * Things that happened in an organization, in order (`sequence`). Integrators read them with
 * `GET /api/v1/events` or receive them through webhook endpoints.
 */
export const apiEvents = pgTable(
  "api_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    sequence: bigserial({ mode: "number" }).notNull(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    type: text().notNull(),
    data: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("api_events_sequence_idx").on(table.sequence),
    index("api_events_tenant_sequence_idx").on(table.tenantId, table.sequence),
  ],
);

/** URLs that receive the organization's events, signed with the endpoint's own secret. */
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    url: text().notNull(),
    description: text(),
    /** Event types to send; empty means every type. */
    eventTypes: text().array().notNull(),
    /** AES-256-GCM ciphertext (see packages/shared/src/runtime/token-cipher.ts). */
    secretEnc: text().notNull(),
    disabledAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("webhook_endpoints_tenant_idx").on(table.tenantId)],
);

/** One event to one endpoint, retried with backoff until it succeeds or attempts run out. */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    endpointId: uuid()
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventId: uuid()
      .notNull()
      .references(() => apiEvents.id, { onDelete: "cascade" }),
    status: webhookDeliveryStatusEnum().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    lastStatusCode: integer(),
    lastError: text(),
    deliveredAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("webhook_deliveries_endpoint_event_idx").on(table.endpointId, table.eventId),
    index("webhook_deliveries_due_idx").on(table.status, table.nextAttemptAt),
    index("webhook_deliveries_endpoint_idx").on(table.endpointId, table.createdAt),
  ],
);
