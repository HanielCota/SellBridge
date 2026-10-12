import { queryOptions } from "@tanstack/react-query";
import { getBilling } from "./billing.functions";
export const billingQueryOptions = () =>
  queryOptions({
    queryKey: ["billing"],
    queryFn: () => getBilling(),
    staleTime: 10000,
    refetchInterval: 15000,
  });
