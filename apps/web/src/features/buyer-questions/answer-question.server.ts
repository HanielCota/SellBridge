import type { Database } from "@sellbridge/database";
import {
  type BuyerQuestionAnswerClaim,
  claimBuyerQuestionAnswer,
  finishBuyerQuestionAnswer,
  releaseBuyerQuestionAnswer,
} from "@sellbridge/database/repositories";
import { storeConnections } from "@sellbridge/database/schema";
import type { MarketplaceQuestion, StoreCredentials } from "@sellbridge/marketplaces";
import { conflictError, notFoundError, userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { and, eq } from "drizzle-orm";

/** The marketplace calls an answer needs; injected so tests never reach Mercado Livre. */
export interface AnswerQuestionDependencies {
  database: Database;
  decrypt: (encrypted: string) => string;
  answerQuestion: (
    store: StoreCredentials,
    input: { questionId: string; text: string },
  ) => Promise<MarketplaceQuestion>;
  readQuestion: (
    store: StoreCredentials,
    questionId: string,
  ) => Promise<MarketplaceQuestion | null>;
  now: () => Date;
}

export interface AnswerQuestionInput {
  tenantId: string;
  userId: string;
  questionId: string;
  text: string;
}

type Claimed = Extract<BuyerQuestionAnswerClaim, { kind: "claimed" }>["question"];

/** Why the question cannot be answered now, in the reseller's words. */
function refusalOf(claim: Exclude<BuyerQuestionAnswerClaim, { kind: "claimed" }>): Error {
  if (claim.kind === "not_found") {
    return notFoundError("Pergunta não encontrada");
  }
  if (claim.kind === "already_sending") {
    return conflictError(
      "A resposta desta pergunta já está sendo enviada. Aguarde alguns segundos.",
    );
  }
  if (claim.kind === "under_review") {
    return conflictError(
      "O Mercado Livre está analisando esta pergunta. Responda quando a análise terminar.",
    );
  }
  return settledRefusal(claim.status);
}

function settledRefusal(status: MarketplaceQuestion["status"]): Error {
  if (status === "removed") {
    return conflictError("Esta pergunta foi apagada no Mercado Livre e não aceita mais resposta.");
  }
  if (status === "closed") {
    return conflictError("O anúncio foi encerrado e a pergunta não aceita mais resposta.");
  }
  return conflictError("Esta pergunta já foi respondida.");
}

async function storeCredentialsOf(
  dependencies: AnswerQuestionDependencies,
  input: { tenantId: string; question: Claimed },
): Promise<StoreCredentials> {
  const [store] = await dependencies.database
    .select({
      status: storeConnections.status,
      accessTokenEnc: storeConnections.accessTokenEnc,
      externalShopId: storeConnections.externalShopId,
    })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.id, input.question.storeConnectionId),
        eq(storeConnections.tenantId, input.tenantId),
      ),
    );
  if (store === undefined || store.status !== "connected" || store.accessTokenEnc === null) {
    throw conflictError("Reconecte a loja em Lojas para responder esta pergunta.");
  }
  return {
    externalShopId: store.externalShopId,
    accessToken: dependencies.decrypt(store.accessTokenEnc),
  };
}

/**
 * The answer did not come back: the question is read again. Answered with these words means
 * the answer went out after all; any other state is stored and explained.
 */
async function settleAfterFailure(
  dependencies: AnswerQuestionDependencies,
  context: { input: AnswerQuestionInput; question: Claimed; store: StoreCredentials },
  failure: unknown,
): Promise<void> {
  const { input, question, store } = context;
  const reading = await dependencies.readQuestion(store, question.externalQuestionId);
  if (reading === null || reading.status !== "unanswered") {
    const ours = reading?.status === "answered" && reading.answerText === input.text.trim();
    await finishBuyerQuestionAnswer(dependencies.database, {
      questionId: question.id,
      reading,
      answeredByUserId: ours ? input.userId : null,
    });
    if (ours) {
      return;
    }
    throw settledRefusal(reading?.status ?? "removed");
  }
  await releaseBuyerQuestionAnswer(dependencies.database, question.id);
  const reason = userMessageOr(failure, "O Mercado Livre não respondeu");
  throw conflictError(`A resposta não foi publicada: ${reason}. Tente de novo.`);
}

async function publishAnswer(
  dependencies: AnswerQuestionDependencies,
  input: AnswerQuestionInput,
  question: Claimed,
): Promise<void> {
  const store = await storeCredentialsOf(dependencies, { tenantId: input.tenantId, question });
  try {
    const answered = await dependencies.answerQuestion(store, {
      questionId: question.externalQuestionId,
      text: input.text,
    });
    await finishBuyerQuestionAnswer(dependencies.database, {
      questionId: question.id,
      reading: answered,
      answeredByUserId: input.userId,
    });
  } catch (error) {
    logger.warn("buyer_question.answer_failed", { questionId: question.id, error });
    await settleAfterFailure(dependencies, { input, question, store }, error);
  }
}

/**
 * Publishes the reseller's answer on the marketplace. Only the first of two clicks sends it;
 * another tenant's question reads as not found.
 *
 * @throws {AppError} When the question is gone, settled, under review, already being sent, the
 * store needs reconnecting, or the marketplace refuses the answer.
 */
export async function answerBuyerQuestion(
  dependencies: AnswerQuestionDependencies,
  input: AnswerQuestionInput,
): Promise<void> {
  const claim = await claimBuyerQuestionAnswer(dependencies.database, {
    tenantId: input.tenantId,
    questionId: input.questionId,
    now: dependencies.now(),
  });
  if (claim.kind !== "claimed") {
    throw refusalOf(claim);
  }
  if (claim.question.marketplace !== "mercado_livre") {
    await releaseBuyerQuestionAnswer(dependencies.database, claim.question.id);
    throw conflictError("Responder por aqui está disponível só para o Mercado Livre por enquanto.");
  }
  try {
    await publishAnswer(dependencies, input, claim.question);
  } catch (error) {
    // A failure before the marketplace call (store, token) frees the question too.
    await releaseBuyerQuestionAnswer(dependencies.database, claim.question.id);
    throw error;
  }
}
