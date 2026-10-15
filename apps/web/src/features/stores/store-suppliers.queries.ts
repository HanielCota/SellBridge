import { queryOptions } from "@tanstack/react-query";
import { getStoreSuppliers, previewStoreSupplier } from "./store-suppliers.functions";

export const storeSuppliersQueryOptions = () =>
  queryOptions({
    queryKey: ["stores", "suppliers"],
    queryFn: () => getStoreSuppliers(),
  });

export const storeSupplierPreviewQueryOptions = (storeConnectionId: string, supplierId: string) =>
  queryOptions({
    queryKey: ["stores", "supplier-preview", storeConnectionId, supplierId],
    queryFn: () => previewStoreSupplier({ data: { storeConnectionId, supplierId } }),
    staleTime: 0,
  });
