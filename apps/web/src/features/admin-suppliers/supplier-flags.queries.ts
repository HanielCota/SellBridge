import { queryOptions } from "@tanstack/react-query";
import { teamListSupplierFlags } from "./supplier-flags.functions";

export const supplierFlagsQueryKey = (supplierId: string) =>
  ["admin-suppliers", "flags", supplierId] as const;

export const supplierFlagsQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: supplierFlagsQueryKey(supplierId),
    queryFn: () => teamListSupplierFlags({ data: { supplierId } }),
  });
