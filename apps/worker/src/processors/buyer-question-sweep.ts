import type { Database } from "@sellbridge/database";
import {
  listClaimSweepStores,
  listStoreWaitingQuestionIds,
} from "@sellbridge/database/repositories";
import type { MarketplaceQuestion, StoreCredentials } from "@sellbridge/marketplaces";
import { logger } from "@sellbridge/shared/logger";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import {
  decryptStoreCredentials,
  expireStoreOnAuthError,
  storeRateKey,
} from "../lib/store-access.ts";
import {
  type QuestionRun,
  type QuestionSync,
  type ReadQuestion,
  storeQuestionReading,
  syncStoreQuestion,
} from "./buyer-question-sync.ts";

export interface QuestionSweepDependencies {
  database: Database;
  cipher: TokenCipher;
  acquireRateLimit: (key: string) => Promise<void>;
  readQuestion: ReadQuestion;
  searchUnanswered: (store: StoreCredentials) => Promise<MarketplaceQuestion[]>;
  now?: () => Date;
}

/** Most stored questions read one by one per store and run; the rest wait for the next run. */
const MAX_REREAD_PER_STORE = 50;

type StoreRow = Awaited<ReturnType<typeof listClaimSweepStores>>[number];
type SweepOutcome = QuestionSync | "failed";

/**
 * Questions SellBridge still counts as waiting that the marketplace no longer lists as waiting:
 * answered or deleted on the marketplace itself, or a notification lost. Each is read again.
 */
async function rereadSettledElsewhere(
  run: QuestionRun,
  listed: ReadonlySet<string>,
  startedAt: Date,
): Promise<SweepOutcome[]> {
  const stored = await listStoreWaitingQuestionIds(run.database, {
    storeConnectionId: run.store.id,
    // A question stored after the search started may simply not be in it yet.
    askedBefore: startedAt,
  });
  const missing = stored.filter((id) => !listed.has(id)).slice(0, MAX_REREAD_PER_STORE);
  const outcomes: SweepOutcome[] = [];
  for (const questionId of missing) {
    try {
      outcomes.push(await syncStoreQuestion(run, questionId));
    } catch (error) {
      logger.warn("buyer_question.sweep_question_failed", {
        storeConnectionId: run.store.id,
        questionId,
        error,
      });
      outcomes.push("failed");
    }
  }
  return outcomes;
}

async function sweepStore(
  dependencies: QuestionSweepDependencies,
  row: StoreRow,
  startedAt: Date,
): Promise<SweepOutcome[]> {
  if (row.accessTokenEnc === null) {
    return [];
  }
  try {
    const credentials = decryptStoreCredentials(dependencies.cipher, {
      externalShopId: row.externalShopId,
      accessTokenEnc: row.accessTokenEnc,
    });
    const run: QuestionRun = {
      ...dependencies,
      marketplace: "mercado_livre",
      store: { id: row.id, tenantId: row.tenantId },
      credentials,
    };
    await dependencies.acquireRateLimit(storeRateKey({ marketplace: run.marketplace, id: row.id }));
    const waiting = await dependencies.searchUnanswered(credentials);
    const outcomes: SweepOutcome[] = [];
    for (const question of waiting) {
      outcomes.push(await storeQuestionReading(run, question));
    }
    const listed = new Set(waiting.map((question) => question.externalQuestionId));
    outcomes.push(...(await rereadSettledElsewhere(run, listed, startedAt)));
    return outcomes;
  } catch (error) {
    logger.warn("buyer_question.sweep_store_failed", { storeConnectionId: row.id, error });
    await expireStoreOnAuthError(
      dependencies.database,
      { id: row.id, accessTokenEnc: row.accessTokenEnc },
      error,
    );
    return ["failed"];
  }
}

/**
 * Safety net for question notifications: every connected Mercado Livre store's waiting
 * questions are read again, and the ones SellBridge still shows as waiting but the marketplace
 * does not (answered or deleted there) are brought up to date.
 */
export function createQuestionSweepProcessor(dependencies: QuestionSweepDependencies) {
  return async function processQuestionSweep() {
    const startedAt = (dependencies.now ?? (() => new Date()))();
    const stores = await listClaimSweepStores(dependencies.database);
    const outcomes: SweepOutcome[] = [];
    // One store at a time: each read spends the store's own quota.
    for (const row of stores) {
      outcomes.push(...(await sweepStore(dependencies, row, startedAt)));
    }
    const summary = {
      stores: stores.length,
      saved: outcomes.filter((outcome) => outcome === "saved").length,
      gone: outcomes.filter((outcome) => outcome === "gone").length,
      outsideSellBridge: outcomes.filter((outcome) => outcome === "outside_sellbridge").length,
      failed: outcomes.filter((outcome) => outcome === "failed").length,
    };
    logger.info("buyer_question.sweep_run", summary);
    return summary;
  };
}
