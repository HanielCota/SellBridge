import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import type { operationsSearchSchema } from "@sellbridge/shared/schemas";
import { getFulfillmentFn, listOperationsFn } from "./fulfillment.functions";
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
