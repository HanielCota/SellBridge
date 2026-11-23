import { queryOptions } from "@tanstack/react-query";
import { getResellerBling } from "./reseller-bling.functions";

export const RESELLER_BLING_QUERY_KEY = ["reseller-bling"] as const;

export const resellerBlingQueryOptions = () =>
  queryOptions({
    queryKey: RESELLER_BLING_QUERY_KEY,
    queryFn: () => getResellerBling(),
  });
