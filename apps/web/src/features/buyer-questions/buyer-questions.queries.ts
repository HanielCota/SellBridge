import { infiniteQueryOptions } from "@tanstack/react-query";
import { listBuyerQuestionsFn } from "./buyer-questions.functions";

export type BuyerQuestionView = "waiting" | "settled";

type QuestionCursor = { askedAt: string; id: string };

/** The first page starts at no question. */
function firstPage(): QuestionCursor | null {
  return null;
}

/** New questions arrive by notification: the list looks again every minute. */
const REFRESH_MILLISECONDS = 60_000;

export const buyerQuestionsQueryOptions = (view: BuyerQuestionView) =>
  infiniteQueryOptions({
    queryKey: ["buyer-questions", view],
    queryFn: ({ pageParam }) => listBuyerQuestionsFn({ data: { view, cursor: pageParam } }),
    initialPageParam: firstPage(),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchInterval: REFRESH_MILLISECONDS,
  });
