import type { SellableCatalogSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getBulkPublishProgress, getSellableCatalog } from "./catalog.functions";

export const sellableCatalogQueryOptions = (search: SellableCatalogSearch) =>
  queryOptions({
    queryKey: ["sellable-catalog", search],
    queryFn: () => getSellableCatalog({ data: search }),
    placeholderData: keepPreviousData,
  });

/** Every bulk-progress poll reads one small row set; 2 s keeps the bar moving with the jobs. */
const BULK_PROGRESS_POLL_MILLISECONDS = 2000;

/** Polls the batch until no job is left pending; the bar and the time left come from it. */
export const bulkPublishProgressQueryOptions = (targetIds: readonly string[]) =>
  queryOptions({
    queryKey: ["bulk-publish-progress", targetIds],
    queryFn: () => getBulkPublishProgress({ data: { targetIds: [...targetIds] } }),
    enabled: targetIds.length > 0,
    refetchInterval: (query) =>
      query.state.data === undefined || query.state.data.pending > 0
        ? BULK_PROGRESS_POLL_MILLISECONDS
        : false,
  });
