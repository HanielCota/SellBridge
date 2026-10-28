import type { ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getSupplierSalesPageFn } from "./sales-page.functions";

export const supplierSalesPageQueryOptions = (supplierId: string, search: ReportPeriodSearch) =>
  queryOptions({
    queryKey: ["supplier-panel", supplierId, "sales-page", search],
    queryFn: () => getSupplierSalesPageFn({ data: { supplierId, ...search } }),
    // Another month keeps the current numbers on screen, faded, until the new ones arrive.
    placeholderData: keepPreviousData,
  });

/** The page's data as the server function returns it, for the client components. */
export type SupplierSalesPageData = Awaited<ReturnType<typeof getSupplierSalesPageFn>>;
