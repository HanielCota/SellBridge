import type { ProblemSearchParams } from "@sellbridge/shared/schemas";
import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import { adminGetProblem, adminListProblems } from "./problems.functions";

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

export const problemQueryOptions = (problemId: string) =>
  queryOptions({
    queryKey: [...PROBLEMS_QUERY_KEY, "detail", problemId],
    queryFn: () => adminGetProblem({ data: { problemId } }),
  });
