import { hasErrorCode } from "@sellbridge/shared/errors";
import { z } from "zod";
import { marketplaceError } from "../errors.ts";
import type { StoreCredentials } from "../types.ts";
import { requestJson, type MercadoLivreConfig, type MercadoLivreContext } from "./client.ts";
import { externalIdSchema } from "./schemas.ts";

/**
 * Buyer questions on the seller's items, read as the official pages describe them ("Perguntas e
 * respostas" and "Gerenciamento de perguntas e respostas", read on 21/11/2026), always with
 * `api_version=4`. The buyer's id is never kept: the reseller answers the question, not the person.
 */
const answerSchema = z.object({
  text: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  date_created: z.string().nullable().optional(),
});
const questionSchema = z.object({
  id: externalIdSchema,
  seller_id: externalIdSchema,
  item_id: z.string().min(1).max(64),
  status: z.string(),
  text: z.string().nullable().optional(),
  date_created: z.string(),
  deleted_from_listing: z.boolean().nullable().optional(),
  answer: answerSchema.nullable().optional(),
});
const questionSearchSchema = z.object({
  total: z.number().int().nonnegative(),
  questions: z.array(questionSchema),
});

/** Where a question stands: only an unanswered one can still be answered. */
export type MarketplaceQuestionStatus =
  | "unanswered"
  | "answered"
  /** The item closed before anyone answered. */
  | "closed"
  /** The marketplace is reviewing the item or the question. */
  | "under_review"
  /** Deleted by the buyer or the seller, or banned by the marketplace. */
  | "removed";

export interface MarketplaceQuestion {
  externalQuestionId: string;
  externalItemId: string;
  status: MarketplaceQuestionStatus;
  text: string;
  askedAt: Date;
  answerText: string | null;
  answeredAt: Date | null;
}

/** "Para responder ou formular perguntas o máximo de caracteres é de 2.000." */
export const MAX_QUESTION_ANSWER_LENGTH = 2_000;
/** Longest question text kept; the marketplace caps it at the same 2,000 characters. */
const MAX_QUESTION_TEXT_LENGTH = 2_000;
/** Questions per search page; the documented examples answer with 50. */
const SEARCH_PAGE_SIZE = 50;
/** Most unanswered questions read per store and search; the rest wait for a notification. */
const MAX_SEARCHED_QUESTIONS = 500;
const NOT_FOUND_STATUS = 404;
/** Fractions longer than milliseconds ("17:51:21.746608612Z" in the docs) are cut to three digits. */
const LONG_FRACTION = /(\.\d{3})\d+/;

const STATUS_OF: Readonly<Record<string, MarketplaceQuestionStatus>> = {
  UNANSWERED: "unanswered",
  ANSWERED: "answered",
  CLOSED_UNANSWERED: "closed",
  UNDER_REVIEW: "under_review",
  BANNED: "removed",
  DELETED: "removed",
  DISABLED: "removed",
};

function questionContext(config: MercadoLivreConfig): MercadoLivreContext {
  return {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
  };
}

function assertNumericId(value: string, label: string): void {
  if (!/^\d{1,20}$/.test(value)) {
    throw marketplaceError(`${label} inválido`, { retryable: false });
  }
}

function dateOf(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  const date = new Date(value.replace(LONG_FRACTION, "$1"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, MAX_QUESTION_TEXT_LENGTH);
}

/** An unknown status is not answerable: it waits like one under review until it changes. */
function statusOf(raw: z.infer<typeof questionSchema>): MarketplaceQuestionStatus {
  if (raw.deleted_from_listing === true) {
    return "removed";
  }
  return STATUS_OF[raw.status.toUpperCase()] ?? "under_review";
}

function questionOf(raw: z.infer<typeof questionSchema>): MarketplaceQuestion {
  const askedAt = dateOf(raw.date_created);
  if (askedAt === null) {
    throw marketplaceError("Data da pergunta ilegível", { retryable: false });
  }
  const answerText = textOrNull(raw.answer?.text);
  return {
    externalQuestionId: String(raw.id),
    externalItemId: raw.item_id,
    status: statusOf(raw),
    text: textOrNull(raw.text) ?? "",
    askedAt,
    answerText,
    answeredAt: answerText === null ? null : dateOf(raw.answer?.date_created),
  };
}

/** Anyone else's question is not ours to show or answer. */
function assertSellerAsked(raw: z.infer<typeof questionSchema>, store: StoreCredentials): void {
  if (String(raw.seller_id) !== store.externalShopId) {
    throw marketplaceError("Pergunta não pertence à loja conectada", { retryable: false });
  }
}

function isNotFound(error: unknown): boolean {
  return (
    hasErrorCode(error, "EXTERNAL_PROVIDER") &&
    Reflect.get(error.details, "status") === NOT_FOUND_STATUS
  );
}

/**
 * Reads one question of the store. Null when the marketplace no longer has it.
 *
 * @throws {AppError} When the question belongs to another seller.
 */
export async function readMercadoLivreQuestion(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  questionId: string,
): Promise<MarketplaceQuestion | null> {
  assertNumericId(questionId, "Número da pergunta");
  try {
    const raw = await requestJson(questionContext(config), {
      schema: questionSchema,
      path: `/questions/${questionId}?api_version=4`,
      init: { accessToken: store.accessToken },
    });
    assertSellerAsked(raw, store);
    return questionOf(raw);
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * The store's questions still waiting for an answer, oldest first. Stops after 500: the rest
 * arrive by notification or on the next search.
 */
export async function searchMercadoLivreUnansweredQuestions(
  config: MercadoLivreConfig,
  store: StoreCredentials,
): Promise<MarketplaceQuestion[]> {
  assertNumericId(store.externalShopId, "Número da loja");
  const context = questionContext(config);
  const questions: MarketplaceQuestion[] = [];
  for (let offset = 0; offset < MAX_SEARCHED_QUESTIONS; offset += SEARCH_PAGE_SIZE) {
    const query = new URLSearchParams({
      seller_id: store.externalShopId,
      status: "UNANSWERED",
      sort_fields: "date_created",
      sort_types: "ASC",
      api_version: "4",
      offset: String(offset),
      limit: String(SEARCH_PAGE_SIZE),
    });
    const page = await requestJson(context, {
      schema: questionSearchSchema,
      path: `/questions/search?${query.toString()}`,
      init: { accessToken: store.accessToken },
    });
    const own = page.questions.filter((raw) => String(raw.seller_id) === store.externalShopId);
    questions.push(...own.map(questionOf));
    if (page.questions.length < SEARCH_PAGE_SIZE || offset + SEARCH_PAGE_SIZE >= page.total) {
      break;
    }
  }
  return questions;
}

/**
 * Publishes the seller's answer to a question (`POST /answers`). Not retried: a repeated POST
 * could publish twice, so a failure is reported and the caller reads the question again.
 *
 * @throws {AppError} When the text is empty or longer than 2,000 characters, or the marketplace
 * refuses the answer.
 */
export async function answerMercadoLivreQuestion(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  input: { questionId: string; text: string },
): Promise<MarketplaceQuestion> {
  assertNumericId(input.questionId, "Número da pergunta");
  const text = input.text.trim();
  if (text === "" || text.length > MAX_QUESTION_ANSWER_LENGTH) {
    throw marketplaceError("Resposta vazia ou longa demais", { retryable: false });
  }
  // The documented body sends the id as a JSON number.
  const questionNumber = Number(input.questionId);
  if (!Number.isSafeInteger(questionNumber)) {
    throw marketplaceError("Número da pergunta inválido", { retryable: false });
  }
  const raw = await requestJson(questionContext(config), {
    schema: questionSchema,
    path: "/answers",
    init: {
      method: "POST",
      accessToken: store.accessToken,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question_id: questionNumber, text }),
    },
  });
  assertSellerAsked(raw, store);
  return questionOf(raw);
}
