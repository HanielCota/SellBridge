import type { FinancialSearch, PeriodSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getDashboard, getFinancials, getSetupProgress } from "./reports.functions";

export const dashboardQueryOptions = (search: PeriodSearch) =>
  queryOptions({
    queryKey: ["dashboard", search],
    queryFn: () => getDashboard({ data: search }),
    placeholderData: keepPreviousData,
  });

export const financialsQueryOptions = (search: FinancialSearch) =>
  queryOptions({
    queryKey: ["financials", search],
    queryFn: () => getFinancials({ data: search }),
    placeholderData: keepPreviousData,
  });

/** Builds the CSV export URL with the same filters as the screen. */
export function financialExportUrl(search: FinancialSearch): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || key === "page" || key === "pageSize") {
      continue;
    }
    params.set(key, String(value));
  }
  return `/api/financeiro/exportar?${params.toString()}`;
}

/** Shared by the dashboard guide and the setup strip; refreshed after publishing. */
export const setupProgressQueryOptions = () =>
  queryOptions({
    queryKey: ["setup-progress"],
    queryFn: () => getSetupProgress(),
  });
