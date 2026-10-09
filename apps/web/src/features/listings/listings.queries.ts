import type { ListingsSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getNewListingData, listListings } from "./listings.functions";

export const listingsQueryOptions = (search: ListingsSearch) =>
  queryOptions({
    queryKey: ["listings", search],
    queryFn: () => listListings({ data: search }),
    placeholderData: keepPreviousData,
    // Poll while something is still queued or publishing, so statuses update by themselves.
    refetchInterval: (query) => (query.state.data?.hasActive ? 2000 : false),
  });

export const newListingQueryOptions = (productId: string) =>
  queryOptions({
    queryKey: ["new-listing", productId],
    queryFn: () => getNewListingData({ data: { productId } }),
  });
