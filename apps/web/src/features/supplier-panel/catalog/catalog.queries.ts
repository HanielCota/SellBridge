import type { CatalogListSearch } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { supplierPanelGetProductForm, supplierPanelListProducts } from "./catalog.functions";

export const supplierPanelCatalogKey = (supplierId: string) =>
  ["supplier-panel", supplierId, "catalog"] as const;

export const supplierPanelProductsQueryOptions = (supplierId: string, search: CatalogListSearch) =>
  queryOptions({
    queryKey: [...supplierPanelCatalogKey(supplierId), "list", search],
    queryFn: () => supplierPanelListProducts({ data: { supplierId, ...search } }),
    placeholderData: keepPreviousData,
  });

/** Loaded once per opened form: autosave answers carry the newer versions afterwards. */
export const supplierPanelProductFormQueryOptions = (supplierId: string, productId?: string) =>
  queryOptions({
    queryKey: [...supplierPanelCatalogKey(supplierId), "form", productId ?? "new"],
    queryFn: () => supplierPanelGetProductForm({ data: { supplierId, productId } }),
    staleTime: Number.POSITIVE_INFINITY,
  });
