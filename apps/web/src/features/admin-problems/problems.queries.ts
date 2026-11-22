import type { ProblemSearchParams } from "@sellbridge/shared/schemas";
import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  adminCountOpenMoneyProblems,
  adminGetProblem,
  adminListProblems,
} from "./problems.functions";

/** The first page has no cursor. */
const FIRST_PAGE = "";

export const PROBLEMS_QUERY_KEY = ["admin", "problems"] as const;

export const problemListQueryOptions = (search: ProblemSearchParams) =>
  infiniteQueryOptions({
    queryKey: [...PROBLEMS_QUERY_KEY, "list", search],
    queryFn: ({ pageParam }) =>
      adminListProblems({
        data: { ...search, cursor: pageParam === FIRST_PAGE ? undefined : pageParam },
      }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });

const MONEY_COUNT_REFRESH_MILLISECONDS = 60_000;

/** Under the problems key, so resolving or reopening one refreshes the tab counter too. */
export const openMoneyProblemCountQueryOptions = () =>
  queryOptions({
    queryKey: [...PROBLEMS_QUERY_KEY, "money-count"],
    queryFn: () => adminCountOpenMoneyProblems(),
    refetchInterval: MONEY_COUNT_REFRESH_MILLISECONDS,
  });

export const problemQueryOptions = (problemId: string) =>
  queryOptions({
    queryKey: [...PROBLEMS_QUERY_KEY, "detail", problemId],
    queryFn: () => adminGetProblem({ data: { problemId } }),
  });
