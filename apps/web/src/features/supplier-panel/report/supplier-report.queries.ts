import type { ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getSupplierReportFn } from "./supplier-report.functions";

export const supplierReportQueryOptions = (supplierId: string, search: ReportPeriodSearch) =>
  queryOptions({
    queryKey: ["supplier-panel", supplierId, "report", search],
    queryFn: () => getSupplierReportFn({ data: { supplierId, ...search } }),
    // Moving between months keeps the previous one on screen, dimmed, until the next arrives.
    placeholderData: keepPreviousData,
  });
