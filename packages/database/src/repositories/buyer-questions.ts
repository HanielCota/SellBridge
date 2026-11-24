import { and, asc, count, desc, eq, gt, inArray, isNull, lt, lte, or } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  buyerQuestions,
  listings,
  listingTargets,
  storeConnections,
  supplierProducts,
  type BuyerQuestionStatus,
} from "../schema/index.ts";

type Marketplace = (typeof storeConnections.$inferSelect)["marketplace"];

/** A question as the marketplace reported it, without the buyer. */
export interface BuyerQuestionReading {
  externalQuestionId: string;
  externalItemId: string;
  status: BuyerQuestionStatus;
  text: string;
  askedAt: Date;
  answerText: string | null;
  answeredAt: Date | null;
}

export interface BuyerQuestionStore {
  id: string;
  tenantId: string;
  marketplace: Marketplace;
}

export type BuyerQuestionSave = "created" | "updated" | "kept" | "outside_sellbridge";

/** The reseller's tabs: questions still to answer, and the ones already settled. */
export type BuyerQuestionView = "waiting" | "settled";

const WAITING_STATUSES: readonly BuyerQuestionStatus[] = ["unanswered", "under_review"];
const SETTLED_STATUSES: readonly BuyerQuestionStatus[] = ["answered", "closed", "removed"];
/** A send that never finished (a crashed request) frees the question after this long. */
const ANSWER_SENDING_TIMEOUT_MILLISECONDS = 2 * 60 * 1000;
/** Most waiting questions the safety net compares per store. */
const MAX_STORE_WAITING_QUESTIONS = 500;

function isSettled(status: BuyerQuestionStatus): boolean {
  return SETTLED_STATUSES.includes(status);
}

async function findListingTarget(
  database: Database,
  input: { storeConnectionId: string; externalItemId: string },
): Promise<string | null> {
  const [target] = await database
    .select({ id: listingTargets.id })
    .from(listingTargets)
    .where(
      and(
        eq(listingTargets.storeConnectionId, input.storeConnectionId),
        eq(listingTargets.externalId, input.externalItemId),
      ),
    )
    .limit(1);
  return target?.id ?? null;
}

/** A banned question comes back with an empty text: the stored words stay. */
function readingValues(reading: BuyerQuestionReading, previousText: string) {
  return {
    status: reading.status,
    text: reading.text === "" ? previousText : reading.text,
    answerText: reading.answerText,
    answeredAt: reading.answeredAt,
  };
}

/**
 * Stores a question of one of the store's SellBridge publications as last read. A question on
 * an item published outside SellBridge is left alone. A reading that would reopen a settled
 * question (an older answer of the marketplace arriving late) changes nothing.
 */
export async function saveBuyerQuestion(
  database: Database,
  input: { store: BuyerQuestionStore; question: BuyerQuestionReading },
): Promise<BuyerQuestionSave> {
  const { store, question } = input;
  const listingTargetId = await findListingTarget(database, {
    storeConnectionId: store.id,
    externalItemId: question.externalItemId,
  });
  if (listingTargetId === null) {
    return "outside_sellbridge";
  }
  return database.transaction(async (transaction) => {
    const [previous] = await transaction
      .select({ id: buyerQuestions.id, status: buyerQuestions.status, text: buyerQuestions.text })
      .from(buyerQuestions)
      .where(
        and(
          eq(buyerQuestions.marketplace, store.marketplace),
          eq(buyerQuestions.externalQuestionId, question.externalQuestionId),
        ),
      )
      .for("update");
    if (previous === undefined) {
      await transaction
        .insert(buyerQuestions)
        .values({
          tenantId: store.tenantId,
          storeConnectionId: store.id,
          listingTargetId,
          marketplace: store.marketplace,
          externalQuestionId: question.externalQuestionId,
          externalItemId: question.externalItemId,
          askedAt: question.askedAt,
          ...readingValues(question, ""),
        })
        // A repeated notification read at the same time already stored it.
        .onConflictDoNothing();
      return "created";
    }
    if (isSettled(previous.status) && !isSettled(question.status)) {
      return "kept";
    }
    await transaction
      .update(buyerQuestions)
      .set(readingValues(question, previous.text))
      .where(eq(buyerQuestions.id, previous.id));
    return "updated";
  });
}

/** The marketplace no longer has the question (deleted with its item or by the buyer). */
export async function markBuyerQuestionGone(
  database: Database,
  input: { marketplace: Marketplace; externalQuestionId: string },
): Promise<void> {
  await database
    .update(buyerQuestions)
    .set({ status: "removed", answerSendingSince: null })
    .where(
      and(
        eq(buyerQuestions.marketplace, input.marketplace),
        eq(buyerQuestions.externalQuestionId, input.externalQuestionId),
      ),
    );
}

/** What the reseller needs to send an answer: the store and the marketplace's question id. */
export interface BuyerQuestionToAnswer {
  id: string;
  storeConnectionId: string;
  marketplace: Marketplace;
  externalQuestionId: string;
}

export type BuyerQuestionAnswerClaim =
  | { kind: "claimed"; question: BuyerQuestionToAnswer }
  | { kind: "not_found" }
  | { kind: "settled"; status: BuyerQuestionStatus }
  | { kind: "under_review" }
  | { kind: "already_sending" };

async function whyNotClaimed(
  database: Database,
  input: { tenantId: string; questionId: string },
): Promise<Exclude<BuyerQuestionAnswerClaim, { kind: "claimed" }>> {
  const [row] = await database
    .select({ status: buyerQuestions.status })
    .from(buyerQuestions)
    .where(
      and(eq(buyerQuestions.id, input.questionId), eq(buyerQuestions.tenantId, input.tenantId)),
    );
  if (row === undefined) {
    return { kind: "not_found" };
  }
  if (row.status === "under_review") {
    return { kind: "under_review" };
  }
  if (row.status === "unanswered") {
    return { kind: "already_sending" };
  }
  return { kind: "settled", status: row.status };
}

/**
 * Takes the question for one answer: of two clicks (or two people), only the first gets it, and
 * only while the question still waits. Another tenant's question reads as not found.
 */
export async function claimBuyerQuestionAnswer(
  database: Database,
  input: { tenantId: string; questionId: string; now: Date },
): Promise<BuyerQuestionAnswerClaim> {
  const expired = new Date(input.now.getTime() - ANSWER_SENDING_TIMEOUT_MILLISECONDS);
  const [claimed] = await database
    .update(buyerQuestions)
    .set({ answerSendingSince: input.now })
    .where(
      and(
        eq(buyerQuestions.id, input.questionId),
        eq(buyerQuestions.tenantId, input.tenantId),
        eq(buyerQuestions.status, "unanswered"),
        or(
          isNull(buyerQuestions.answerSendingSince),
          lt(buyerQuestions.answerSendingSince, expired),
        ),
      ),
    )
    .returning({
      id: buyerQuestions.id,
      storeConnectionId: buyerQuestions.storeConnectionId,
      marketplace: buyerQuestions.marketplace,
      externalQuestionId: buyerQuestions.externalQuestionId,
    });
  if (claimed !== undefined) {
    return { kind: "claimed", question: claimed };
  }
  return whyNotClaimed(database, input);
}

/**
 * Stores what the marketplace says after an answer attempt and frees the question. A null
 * reading means the marketplace no longer has it. `answeredByUserId` names who answered through
 * SellBridge, or null when the answer came from elsewhere.
 */
export async function finishBuyerQuestionAnswer(
  database: Database,
  input: {
    questionId: string;
    reading: BuyerQuestionReading | null;
    answeredByUserId: string | null;
  },
): Promise<void> {
  if (input.reading === null) {
    await database
      .update(buyerQuestions)
      .set({ status: "removed", answerSendingSince: null })
      .where(eq(buyerQuestions.id, input.questionId));
    return;
  }
  const { reading } = input;
  await database
    .update(buyerQuestions)
    .set({
      status: reading.status,
      answerText: reading.answerText,
      answeredAt: reading.answeredAt,
      answeredByUserId: reading.status === "answered" ? input.answeredByUserId : null,
      answerSendingSince: null,
    })
    .where(eq(buyerQuestions.id, input.questionId));
}

/** Frees a question whose answer did not go out, so the reseller can try again. */
export async function releaseBuyerQuestionAnswer(
  database: Database,
  questionId: string,
): Promise<void> {
  await database
    .update(buyerQuestions)
    .set({ answerSendingSince: null })
    .where(eq(buyerQuestions.id, questionId));
}

export interface BuyerQuestionRow {
  id: string;
  text: string;
  status: BuyerQuestionStatus;
  askedAt: Date;
  answerText: string | null;
  answeredAt: Date | null;
  answerSending: boolean;
  answeredInSellBridge: boolean;
  marketplace: Marketplace;
  storeName: string | null;
  listingTitle: string;
  imageUrl: string | null;
  itemUrl: string | null;
}

/** Where the next page starts: the last question shown. */
export interface BuyerQuestionCursor {
  askedAt: Date;
  id: string;
}

function pageCondition(view: BuyerQuestionView, cursor: BuyerQuestionCursor | null) {
  if (cursor === null) {
    return undefined;
  }
  if (view === "waiting") {
    return or(
      gt(buyerQuestions.askedAt, cursor.askedAt),
      and(eq(buyerQuestions.askedAt, cursor.askedAt), gt(buyerQuestions.id, cursor.id)),
    );
  }
  return or(
    lt(buyerQuestions.askedAt, cursor.askedAt),
    and(eq(buyerQuestions.askedAt, cursor.askedAt), lt(buyerQuestions.id, cursor.id)),
  );
}

/**
 * One page of the tenant's questions: the waiting ones oldest first (the longest wait on top),
 * the settled ones newest first.
 */
export async function listBuyerQuestions(
  database: Database,
  input: {
    tenantId: string;
    view: BuyerQuestionView;
    limit: number;
    cursor: BuyerQuestionCursor | null;
  },
): Promise<BuyerQuestionRow[]> {
  const statuses = input.view === "waiting" ? WAITING_STATUSES : SETTLED_STATUSES;
  const order =
    input.view === "waiting"
      ? [asc(buyerQuestions.askedAt), asc(buyerQuestions.id)]
      : [desc(buyerQuestions.askedAt), desc(buyerQuestions.id)];
  const rows = await database
    .select({
      id: buyerQuestions.id,
      text: buyerQuestions.text,
      status: buyerQuestions.status,
      askedAt: buyerQuestions.askedAt,
      answerText: buyerQuestions.answerText,
      answeredAt: buyerQuestions.answeredAt,
      answerSendingSince: buyerQuestions.answerSendingSince,
      answeredByUserId: buyerQuestions.answeredByUserId,
      marketplace: buyerQuestions.marketplace,
      storeName: storeConnections.shopName,
      listingTitle: listings.title,
      imageUrls: supplierProducts.imageUrls,
      itemUrl: listingTargets.externalUrl,
    })
    .from(buyerQuestions)
    .innerJoin(listingTargets, eq(listingTargets.id, buyerQuestions.listingTargetId))
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(storeConnections, eq(storeConnections.id, buyerQuestions.storeConnectionId))
    .where(
      and(
        eq(buyerQuestions.tenantId, input.tenantId),
        inArray(buyerQuestions.status, [...statuses]),
        pageCondition(input.view, input.cursor),
      ),
    )
    .orderBy(...order)
    .limit(input.limit);
  return rows.map(({ imageUrls, answerSendingSince, answeredByUserId, ...row }) => ({
    ...row,
    imageUrl: imageUrls[0] ?? null,
    answerSending: answerSendingSince !== null,
    answeredInSellBridge: answeredByUserId !== null,
  }));
}

/** Questions the tenant still has to answer: the menu's badge. */
export async function countWaitingBuyerQuestions(
  database: Database,
  tenantId: string,
): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(buyerQuestions)
    .where(and(eq(buyerQuestions.tenantId, tenantId), eq(buyerQuestions.status, "unanswered")));
  return row?.total ?? 0;
}

/** The store's questions SellBridge still counts as waiting, for the safety net to compare. */
export async function listStoreWaitingQuestionIds(
  database: Database,
  input: { storeConnectionId: string; askedBefore: Date },
): Promise<string[]> {
  const rows = await database
    .select({ externalQuestionId: buyerQuestions.externalQuestionId })
    .from(buyerQuestions)
    .where(
      and(
        eq(buyerQuestions.storeConnectionId, input.storeConnectionId),
        eq(buyerQuestions.status, "unanswered"),
        lte(buyerQuestions.askedAt, input.askedBefore),
      ),
    )
    .orderBy(asc(buyerQuestions.askedAt))
    .limit(MAX_STORE_WAITING_QUESTIONS);
  return rows.map((row) => row.externalQuestionId);
}
