import { queryOptions } from "@tanstack/react-query";
import { getSupplierHomeFn } from "./home.functions";

/** Deadlines move by the minute: the queue refreshes while the page stays open. */
const HOME_REFETCH_MILLISECONDS = 60_000;

export const supplierHomeQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: ["supplier-panel", supplierId, "home"],
    queryFn: () => getSupplierHomeFn({ data: { supplierId } }),
    refetchInterval: HOME_REFETCH_MILLISECONDS,
  });
