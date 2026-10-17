import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";
import { listings } from "./listings.ts";
import { orders } from "./orders.ts";
import { storeConnections } from "./stores.ts";
import {
  ticketCategoryEnum,
  ticketEventTypeEnum,
  ticketPriorityEnum,
  ticketStatusEnum,
} from "./enums.ts";

export const tickets = pgTable(
  "tickets",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdById: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    subject: text().notNull(),
    status: ticketStatusEnum().notNull().default("open"),
    category: ticketCategoryEnum().notNull().default("other"),
    priority: ticketPriorityEnum().notNull().default("normal"),
    /** Member of the support team in charge; null while the ticket waits in the queue. */
    assigneeId: text().references(() => user.id, { onDelete: "set null" }),
    /**
     * Since when the reseller waits for support (first unanswered message); null when support
     * owes nothing. The response deadline is this plus the priority's target hours.
     */
    awaitingSince: timestamp({ withTimezone: true }),
    /**
     * When support must answer by: `awaitingSince` plus the priority's target, counted in
     * business hours (item 27.b). Null while support owes nothing.
     */
    responseDueAt: timestamp({ withTimezone: true }),
    /** The store the ticket is about, when opened from Lojas (item 27.a). */
    storeConnectionId: uuid().references(() => storeConnections.id, { onDelete: "set null" }),
    /** The listing the ticket is about, when opened from Publicações (item 27.a). */
    listingId: uuid().references(() => listings.id, { onDelete: "set null" }),
    /** First public support reply, for the first-response metrics. */
    firstResponseAt: timestamp({ withTimezone: true }),
    closedAt: timestamp({ withTimezone: true }),
    /** Satisfaction (1–5) given by the reseller after the ticket was closed. */
    rating: smallint(),
    ratingComment: text(),
    ratedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("tickets_tenant_idx").on(table.tenantId),
    index("tickets_queue_idx").on(table.status, table.assigneeId),
    check("tickets_rating_range", sql`${table.rating} between 1 and 5`),
  ],
);

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    ticketId: uuid()
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    isAdmin: boolean().notNull().default(false),
    /** Support-only note: never shown to the reseller and never changes the ticket status. */
    isInternal: boolean().notNull().default(false),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("ticket_messages_ticket_idx").on(table.ticketId)],
);

export const ticketAttachments = pgTable(
  "ticket_attachments",
  {
    id: uuid().primaryKey().defaultRandom(),
    ticketId: uuid()
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    messageId: uuid()
      .notNull()
      .references(() => ticketMessages.id, { onDelete: "cascade" }),
    storageKey: text().notNull(),
    fileName: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ticket_attachments_ticket_idx").on(table.ticketId),
    check("ticket_attachments_size_check", sql`${table.sizeBytes} >= 0`),
  ],
);

/**
 * Who changed what on a ticket and when. `automatic` marks changes made by the system
 * (auto-close); `actorId` alone can't tell, since it turns null when a user is deleted.
 */
export const ticketEvents = pgTable(
  "ticket_events",
  {
    /** Sequential, so changes made in the same instant keep the order they happened in. */
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    ticketId: uuid()
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    automatic: boolean().notNull().default(false),
    type: ticketEventTypeEnum().notNull(),
    fromValue: text(),
    toValue: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("ticket_events_ticket_idx").on(table.ticketId, table.id)],
);

/** Up to when each person read a thread: drives the "new reply" dots on both sides. */
export const ticketReads = pgTable(
  "ticket_reads",
  {
    ticketId: uuid()
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    readAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.ticketId, table.userId] })],
);

/** Orders the reseller pinned to a ticket, so support sees what the conversation is about. */
export const ticketOrders = pgTable(
  "ticket_orders",
  {
    ticketId: uuid()
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    linkedById: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ticketId, table.orderId] }),
    index("ticket_orders_order_idx").on(table.orderId),
  ],
);

/**
 * Who gets an e-mail when support answers. The requester follows without a row; a row with
 * `notify = false` mutes someone, and colleagues of the store are added with `notify = true`.
 */
export const ticketFollowers = pgTable(
  "ticket_followers",
  {
    ticketId: uuid()
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    notify: boolean().notNull().default(true),
    addedById: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.ticketId, table.userId] })],
);
