import { queryOptions } from "@tanstack/react-query";
import { getAttentionCounts, getOpenTicketCount } from "./navigation.functions";

const REFRESH_MILLISECONDS = 60_000;

// Keys start with "listings"/"tickets" so the existing invalidations also refresh the badges.
export const attentionCountsQueryOptions = () =>
  queryOptions({
    queryKey: ["listings", "tickets", "attention-counts"],
    queryFn: () => getAttentionCounts(),
    refetchInterval: REFRESH_MILLISECONDS,
  });

export const openTicketCountQueryOptions = () =>
  queryOptions({
    queryKey: ["tickets", "admin", "open-count"],
    queryFn: () => getOpenTicketCount(),
    refetchInterval: REFRESH_MILLISECONDS,
  });
