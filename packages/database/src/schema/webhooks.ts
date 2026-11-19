import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
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
    /**
     * Still unprocessed when the sweep's retry window closed: the event was handed to the team
     * on the admin Problemas page instead of being retried, until someone retries it there.
     */
    abandonedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("webhook_events_external_idx").on(table.marketplace, table.externalEventId),
    /** The worker's sweeper only looks at unprocessed events, a tiny slice of the table. */
    index("webhook_events_unprocessed_idx")
      .on(table.receivedAt)
      .where(sql`${table.processedAt} is null`),
    /** Retention: finished events past 30 days are deleted by this date. */
    index("webhook_events_received_idx").on(table.receivedAt),
  ],
);
