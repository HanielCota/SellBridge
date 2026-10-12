import { queryOptions } from "@tanstack/react-query";
import { getAttentionCounts, getOpenTicketCount } from "./navigation.functions";

const REFRESH_MILLISECONDS = 60_000;

// The key starts with "listings", so invalidating ["listings"] refreshes the badges; after a
// support change, invalidate ["listings", "tickets", "attention-counts"] by name.
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
