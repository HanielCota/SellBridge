import { queryOptions } from "@tanstack/react-query";
import { getBuyerTrackingFn } from "./buyer-tracking.functions";

export const buyerTrackingQueryOptions = (token: string) =>
  queryOptions({
    queryKey: ["buyer-tracking", token],
    queryFn: () => getBuyerTrackingFn({ data: { token } }),
    retry: false,
  });
