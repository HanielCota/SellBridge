import { queryOptions } from "@tanstack/react-query";
import { getStoreSuppliers, previewStoreSupplierRemovalFn } from "./store-suppliers.functions";

export const storeSuppliersQueryOptions = (pickedSupplierId?: string) =>
  queryOptions({
    queryKey: ["stores", "suppliers", pickedSupplierId ?? null],
    queryFn: () => getStoreSuppliers({ data: { pickedSupplierId } }),
  });

export const storeSupplierRemovalPreviewQueryOptions = (
  storeConnectionId: string,
  supplierId: string,
) =>
  queryOptions({
    queryKey: ["stores", "supplier-removal-preview", storeConnectionId, supplierId],
    queryFn: () => previewStoreSupplierRemovalFn({ data: { storeConnectionId, supplierId } }),
    staleTime: 0,
  });
