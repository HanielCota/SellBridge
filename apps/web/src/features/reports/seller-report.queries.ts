import type { ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getSellerReport } from "./seller-report.functions";

export const sellerReportQueryOptions = (search: ReportPeriodSearch) =>
  queryOptions({
    queryKey: ["seller-report", search],
    queryFn: () => getSellerReport({ data: search }),
    placeholderData: keepPreviousData,
  });

/** The orders spreadsheet of the financial page, cut to the report's days. */
export function sellerReportSpreadsheetUrl(period: { fromDate: string; toDate: string }): string {
  const params = new URLSearchParams({
    period: "custom",
    from: period.fromDate,
    to: period.toDate,
  });
  return `/api/financeiro/exportar?${params.toString()}`;
}
