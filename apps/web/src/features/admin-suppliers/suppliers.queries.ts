import type { AdminSupplierSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { adminGetSupplier, adminListProducts, adminListSuppliers } from "./suppliers.functions";

export const adminSuppliersQueryOptions = (search: AdminSupplierSearch) =>
  queryOptions({
    queryKey: ["admin-suppliers", search],
    queryFn: () => adminListSuppliers({ data: search }),
    placeholderData: keepPreviousData,
  });
export const adminSupplierQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: ["admin-suppliers", "detail", supplierId],
    queryFn: () => adminGetSupplier({ data: { supplierId } }),
  });
export const adminProductsQueryOptions = (supplierId: string, search: AdminSupplierSearch) =>
  queryOptions({
    queryKey: ["admin-suppliers", "products", supplierId, search],
    queryFn: () => adminListProducts({ data: { supplierId, ...search } }),
    placeholderData: keepPreviousData,
  });
