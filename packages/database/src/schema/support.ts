import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";
import { ticketStatusEnum } from "./enums.ts";

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
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("tickets_tenant_idx").on(table.tenantId)],
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
  (table) => [index("ticket_attachments_ticket_idx").on(table.ticketId)],
);
