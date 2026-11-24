import type { ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  getSupplierStatementTotalsFn,
  listSupplierStatementLinesFn,
} from "./supplier-statement.functions";

/** The first page has no cursor. */
const FIRST_PAGE = "";

const statementKey = (supplierId: string, search: ReportPeriodSearch) =>
  ["supplier-panel", supplierId, "statement", search] as const;

export const supplierStatementTotalsQueryOptions = (
  supplierId: string,
  search: ReportPeriodSearch,
) =>
  queryOptions({
    queryKey: [...statementKey(supplierId, search), "totals"],
    queryFn: () => getSupplierStatementTotalsFn({ data: { supplierId, ...search } }),
    placeholderData: keepPreviousData,
  });

export const supplierStatementLinesQueryOptions = (
  supplierId: string,
  search: ReportPeriodSearch,
) =>
  infiniteQueryOptions({
    queryKey: [...statementKey(supplierId, search), "lines"],
    queryFn: ({ pageParam }) =>
      listSupplierStatementLinesFn({
        data: {
          supplierId,
          ...search,
          cursor: pageParam === FIRST_PAGE ? undefined : pageParam,
        },
      }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
