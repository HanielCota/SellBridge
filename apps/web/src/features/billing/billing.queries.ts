import { queryOptions } from "@tanstack/react-query";
import { getBilling, getBillingNotice } from "./billing.functions";
export const billingQueryOptions = () =>
  queryOptions({
    queryKey: ["billing"],
    queryFn: () => getBilling(),
    staleTime: 10000,
    refetchInterval: 15000,
  });
export const billingNoticeQueryOptions = () =>
  queryOptions({
    queryKey: ["billing", "notice"],
    queryFn: () => getBillingNotice(),
    staleTime: 60_000,
  });
