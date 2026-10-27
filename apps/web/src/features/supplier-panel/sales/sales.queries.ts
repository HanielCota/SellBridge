import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { SupplierSalesSearch } from "./sales-search";
import { getSupplierSalesFn } from "./sales.functions";

export const supplierSalesQueryOptions = (supplierId: string, search: SupplierSalesSearch) =>
  queryOptions({
    queryKey: ["supplier-panel", supplierId, "sales", search],
    queryFn: () => getSupplierSalesFn({ data: { supplierId, ...search } }),
    placeholderData: keepPreviousData,
  });

/** The home's data as the server function returns it, for the client components. */
export type SupplierSalesData = Awaited<ReturnType<typeof getSupplierSalesFn>>;
