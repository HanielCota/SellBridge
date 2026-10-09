import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { marketplaceEnum } from "./enums.ts";

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    marketplace: marketplaceEnum().notNull(),
    externalEventId: text().notNull(),
    topic: text().notNull(),
    rawPayload: jsonb().notNull(),
    signatureValid: boolean().notNull(),
    receivedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp({ withTimezone: true }),
    error: text(),
  },
  (table) => [
    uniqueIndex("webhook_events_external_idx").on(table.marketplace, table.externalEventId),
  ],
);
