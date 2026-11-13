import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { SupplierOperationSearch } from "./operation-search";
import { getSupplierOperationFn } from "./operation.functions";

export const supplierOperationQueryOptions = (
  supplierId: string,
  search: SupplierOperationSearch,
) =>
  queryOptions({
    queryKey: ["supplier-panel", supplierId, "operation", search],
    queryFn: () => getSupplierOperationFn({ data: { supplierId, ...search } }),
    placeholderData: keepPreviousData,
  });

export type SupplierOperationData = Awaited<ReturnType<typeof getSupplierOperationFn>>;
