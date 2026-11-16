import { queryOptions } from "@tanstack/react-query";
import { getStoreSuppliers } from "./store-suppliers.functions";

export const storeSuppliersQueryOptions = (pickedSupplierId?: string) =>
  queryOptions({
    queryKey: ["stores", "suppliers", pickedSupplierId ?? null],
    queryFn: () => getStoreSuppliers({ data: { pickedSupplierId } }),
  });
