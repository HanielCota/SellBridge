import type { CatalogSearch, SupplierListSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getSupplierCatalog, listSuppliers } from "./suppliers.functions";

export const suppliersQueryOptions = (search: SupplierListSearch) =>
  queryOptions({
    queryKey: ["suppliers", search],
    queryFn: () => listSuppliers({ data: search }),
  });

export const supplierCatalogQueryOptions = (supplierId: string, search: CatalogSearch) =>
  queryOptions({
    queryKey: ["supplier-catalog", supplierId, search],
    queryFn: () => getSupplierCatalog({ data: { ...search, supplierId } }),
    placeholderData: keepPreviousData,
  });
