import { DEFAULT_FEE_SCHEDULE, type FeeSchedule } from "@sellbridge/shared/fee-model";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { getFeeSchedule } from "./fee-schedule.functions";

/** The server's fees change only with a deploy: one fetch serves the whole visit. */
export const feeScheduleQueryOptions = queryOptions({
  queryKey: ["fee-schedule"],
  queryFn: () => getFeeSchedule(),
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * The fees the price previews use. The pages that show previews prefetch it in their loader, so
 * the default (today's 14%, no SellBridge fee) only shows if that request failed.
 */
export function useFeeSchedule(): FeeSchedule {
  return useQuery(feeScheduleQueryOptions).data ?? DEFAULT_FEE_SCHEDULE;
}
