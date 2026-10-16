import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { notificationChannelEnum, notificationDeliveryStatusEnum } from "./enums.ts";

/**
 * Until when each user has seen the notification center of an organization (any device), and
 * when they last cleared it there: events up to `clearedAt` are no longer listed. Kept per
 * organization, since a user who belongs to two sees different events in each.
 */
export const notificationReads = pgTable(
  "notification_reads",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    seenAt: timestamp({ withTimezone: true }).notNull(),
    clearedAt: timestamp({ withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tenantId] })],
);

/**
 * One notification to one person on one outbound channel (e-mail, push), retried with backoff
 * until it is sent or attempts run out. In-app notifications are not stored here: the bell
 * derives them from live data. `dedupeKey` names the fact ("order:<id>:paid"), so the same fact
 * reaching the queue twice notifies once. `tenantId` is null for team notices (new ticket).
 */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().references(() => organization.id, { onDelete: "cascade" }),
    recipientId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    event: text().notNull(),
    channel: notificationChannelEnum().notNull(),
    dedupeKey: text().notNull(),
    /** The message itself, rendered when queued (`NotificationContent`). */
    content: jsonb().notNull(),
    status: notificationDeliveryStatusEnum().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    lastError: text(),
    sentAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("notification_deliveries_dedupe_idx").on(
      table.recipientId,
      table.channel,
      table.dedupeKey,
    ),
    index("notification_deliveries_due_idx").on(table.status, table.nextAttemptAt),
    index("notification_deliveries_tenant_idx").on(table.tenantId),
    check("notification_deliveries_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

/**
 * A person's choice for one event on one channel. Only choices that differ from the event's
 * default are meaningful; a missing row means "use the default" (`notification-events`).
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    event: text().notNull(),
    channel: notificationChannelEnum().notNull(),
    enabled: boolean().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.event, table.channel] })],
);
