import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";
import { marketplaceEnum } from "./enums.ts";
import { listingTargets } from "./listings.ts";
import { storeConnections } from "./stores.ts";

/** Where a buyer's question stands on the marketplace; only `unanswered` can be answered. */
export type BuyerQuestionStatus = "unanswered" | "answered" | "closed" | "under_review" | "removed";

/**
 * A buyer's question on a publication made through SellBridge, as the marketplace last reported
 * it. The reseller answers it here; the buyer's identity is never stored. Questions on items the
 * account sells outside SellBridge are left to the marketplace.
 */
export const buyerQuestions = pgTable(
  "buyer_questions",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    storeConnectionId: uuid()
      .notNull()
      .references(() => storeConnections.id, { onDelete: "cascade" }),
    listingTargetId: uuid()
      .notNull()
      .references(() => listingTargets.id, { onDelete: "cascade" }),
    marketplace: marketplaceEnum().notNull(),
    externalQuestionId: text().notNull(),
    externalItemId: text().notNull(),
    text: text().notNull(),
    status: text().$type<BuyerQuestionStatus>().notNull(),
    askedAt: timestamp({ withTimezone: true }).notNull(),
    answerText: text(),
    answeredAt: timestamp({ withTimezone: true }),
    /** Who answered through SellBridge; null when the answer was given on the marketplace. */
    answeredByUserId: text().references(() => user.id, { onDelete: "set null" }),
    /** Set while an answer is on its way to the marketplace, so a second click cannot send another. */
    answerSendingSince: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("buyer_questions_external_idx").on(table.marketplace, table.externalQuestionId),
    // The reseller's list, waiting ones oldest first.
    index("buyer_questions_tenant_status_idx").on(table.tenantId, table.status, table.askedAt),
    // The safety net compares each store's waiting questions with the marketplace's.
    index("buyer_questions_store_waiting_idx")
      .on(table.storeConnectionId)
      .where(sql`${table.status} = 'unanswered'`),
    check(
      "buyer_questions_status_check",
      sql`${table.status} in ('unanswered','answered','closed','under_review','removed')`,
    ),
  ],
);
