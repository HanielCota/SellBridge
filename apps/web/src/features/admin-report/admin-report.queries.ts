import type { ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getAdminMonthlyReport } from "./admin-report.functions";

export const adminReportQueryOptions = (search: ReportPeriodSearch) =>
  queryOptions({
    queryKey: [
      "admin",
      "monthly-report",
      search.mes ?? null,
      search.de ?? null,
      search.ate ?? null,
    ],
    queryFn: () => getAdminMonthlyReport({ data: search }),
    placeholderData: keepPreviousData,
  });
