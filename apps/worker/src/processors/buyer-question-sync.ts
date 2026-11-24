import type { Database } from "@sellbridge/database";
import { markBuyerQuestionGone, saveBuyerQuestion } from "@sellbridge/database/repositories";
import type {
  MarketplaceId,
  MarketplaceQuestion,
  StoreCredentials,
} from "@sellbridge/marketplaces";
import { logger } from "@sellbridge/shared/logger";
import { storeRateKey } from "../lib/store-access.ts";

/** Reads one question of the store; null when the marketplace no longer has it. */
export type ReadQuestion = (
  store: StoreCredentials,
  questionId: string,
) => Promise<MarketplaceQuestion | null>;

/** One store's question reads, with its decrypted token. */
export interface QuestionRun {
  database: Database;
  acquireRateLimit: (key: string) => Promise<void>;
  readQuestion: ReadQuestion;
  marketplace: MarketplaceId;
  store: { id: string; tenantId: string };
  credentials: StoreCredentials;
}

export type QuestionSync = "saved" | "outside_sellbridge" | "gone";

/**
 * Stores a question already read from the marketplace on its SellBridge publication. A question
 * on an item published outside SellBridge is left to the marketplace.
 */
export async function storeQuestionReading(
  run: Pick<QuestionRun, "database" | "marketplace" | "store">,
  question: MarketplaceQuestion,
): Promise<QuestionSync> {
  const store = { ...run.store, marketplace: run.marketplace };
  const saved = await saveBuyerQuestion(run.database, { store, question });
  if (saved === "outside_sellbridge") {
    return "outside_sellbridge";
  }
  if (saved === "created") {
    logger.info("buyer_question.received", {
      tenantId: run.store.tenantId,
      storeConnectionId: run.store.id,
      externalQuestionId: question.externalQuestionId,
      status: question.status,
    });
  }
  return "saved";
}

/**
 * Reads a question of the store again (the notification is only a prompt, never trusted) and
 * stores it. A question the marketplace no longer has is marked removed.
 */
export async function syncStoreQuestion(
  run: QuestionRun,
  questionId: string,
): Promise<QuestionSync> {
  // Notifications are unsigned: each read spends the store's own quota.
  await run.acquireRateLimit(storeRateKey({ marketplace: run.marketplace, id: run.store.id }));
  const question = await run.readQuestion(run.credentials, questionId);
  if (question === null) {
    await markBuyerQuestionGone(run.database, {
      marketplace: run.marketplace,
      externalQuestionId: questionId,
    });
    return "gone";
  }
  return storeQuestionReading(run, question);
}
