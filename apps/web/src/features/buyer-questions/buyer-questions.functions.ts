import { answerMercadoLivreQuestion, readMercadoLivreQuestion } from "@sellbridge/marketplaces";
import { listBuyerQuestions } from "@sellbridge/database/repositories";
import { notFoundError } from "@sellbridge/shared/errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buyerQuestionsEnabled } from "@/lib/server/buyer-questions-switch";
import { database } from "@/lib/server/database";
import { mercadoLivreApiConfig, tokenCipher } from "@/lib/server/marketplaces";
import { tenantMiddleware } from "@/lib/server/middleware";
import { answerBuyerQuestion } from "./answer-question.server";
import { answerTextSchema } from "./answer-text";

/** Questions per page: a busy store's day of questions fits in one. */
const PAGE_SIZE = 30;

function assertEnabled(): void {
  if (!buyerQuestionsEnabled()) {
    throw notFoundError("Página não encontrada");
  }
}

const listSchema = z.object({
  view: z.enum(["waiting", "settled"]),
  cursor: z.object({ askedAt: z.iso.datetime(), id: z.uuid() }).nullable(),
});

/** One page of the seller's buyer questions; another tenant's never show. */
export const listBuyerQuestionsFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(listSchema)
  .handler(async ({ context, data }) => {
    assertEnabled();
    const rows = await listBuyerQuestions(database, {
      tenantId: context.tenantId,
      view: data.view,
      limit: PAGE_SIZE + 1,
      cursor:
        data.cursor === null
          ? null
          : { askedAt: new Date(data.cursor.askedAt), id: data.cursor.id },
    });
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    const hasMore = rows.length > PAGE_SIZE && last !== undefined;
    return {
      questions: page,
      nextCursor: hasMore ? { askedAt: last.askedAt.toISOString(), id: last.id } : null,
    };
  });

const answerSchema = z.object({
  questionId: z.uuid("Pergunta inválida"),
  text: answerTextSchema,
});

/** Publishes the seller's answer on Mercado Livre; a second click while it sends is refused. */
export const answerBuyerQuestionFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(answerSchema)
  .handler(async ({ context, data }) => {
    assertEnabled();
    await answerBuyerQuestion(
      {
        database,
        decrypt: (encrypted) => tokenCipher.decrypt(encrypted),
        answerQuestion: async (store, input) =>
          answerMercadoLivreQuestion(mercadoLivreApiConfig, store, input),
        readQuestion: async (store, questionId) =>
          readMercadoLivreQuestion(mercadoLivreApiConfig, store, questionId),
        now: () => new Date(),
      },
      { tenantId: context.tenantId, userId: context.userId, ...data },
    );
    return { answered: true };
  });
