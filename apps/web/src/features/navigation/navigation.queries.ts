import { queryOptions } from "@tanstack/react-query";
import { staffQueueCountsQueryOptions } from "@/features/support/support.queries";
import { getAttentionCounts } from "./navigation.functions";

const REFRESH_MILLISECONDS = 60_000;

// The key starts with "listings", so invalidating ["listings"] refreshes the badges; after a
// support change, invalidate ["listings", "tickets", "attention-counts"] by name.
export const attentionCountsQueryOptions = () =>
  queryOptions({
    queryKey: ["listings", "tickets", "attention-counts"],
    queryFn: () => getAttentionCounts(),
    refetchInterval: REFRESH_MILLISECONDS,
  });

/**
 * The nav badge reads the queue counts the ticket list already keeps: a query of its own ran the
 * same count on the server under another key, twice per cycle on the queue page.
 */
export const openTicketCountQueryOptions = () =>
  queryOptions({
    ...staffQueueCountsQueryOptions(),
    refetchInterval: REFRESH_MILLISECONDS,
    select: (counts) => counts.open,
  });
