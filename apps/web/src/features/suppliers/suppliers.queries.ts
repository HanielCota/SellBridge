import type { CatalogSearch, SupplierListSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getSupplierCatalog, getSupplierReputation, listSuppliers } from "./suppliers.functions";

export const suppliersQueryOptions = (search: SupplierListSearch) =>
  queryOptions({
    queryKey: ["suppliers", search],
    queryFn: () => listSuppliers({ data: search }),
    // A new filter keeps the current cards on screen until the new ones arrive, without flashing.
    placeholderData: keepPreviousData,
  });

export const supplierCatalogQueryOptions = (supplierId: string, search: CatalogSearch) =>
  queryOptions({
    queryKey: ["supplier-catalog", supplierId, search],
    queryFn: () => getSupplierCatalog({ data: { ...search, supplierId } }),
    placeholderData: keepPreviousData,
  });

export const supplierReputationQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: ["supplier-reputation", supplierId],
    queryFn: () => getSupplierReputation({ data: { supplierId } }),
  });
