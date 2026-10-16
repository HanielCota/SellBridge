import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import type { operationsSearchSchema } from "@sellbridge/shared/schemas";
import { getFulfillmentFn, getSupplierShipmentFn, listOperationsFn } from "./fulfillment.functions";
export const operationsQueryOptions = (search: z.infer<typeof operationsSearchSchema>) =>
  queryOptions({
    queryKey: ["operations", search],
    queryFn: () => listOperationsFn({ data: search }),
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  });
export const fulfillmentQueryOptions = (orderId: string) =>
  queryOptions({
    queryKey: ["fulfillment", orderId],
    queryFn: () => getFulfillmentFn({ data: { orderId } }),
    refetchInterval: 15000,
  });
/** The supplier's portal: a revoked or expired token fails for good, so it is not retried. */
export const supplierShipmentQueryOptions = (token: string) =>
  queryOptions({
    queryKey: ["supplier-shipment", token],
    queryFn: () => getSupplierShipmentFn({ data: { token } }),
    refetchInterval: 15000,
    retry: false,
  });
