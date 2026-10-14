import type { ListingsSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getNewListingData, listListings } from "./listings.functions";

export const listingsQueryOptions = (search: ListingsSearch) =>
  queryOptions({
    queryKey: ["listings", search],
    queryFn: () => listListings({ data: search }),
    placeholderData: keepPreviousData,
    // Poll while something is still queued or publishing, so statuses update by themselves.
    // Every poll reloads the whole page of listings with its sales; publishing goes at the
    // marketplace's pace (seconds per item), so 5 s shows each change without the load of 2 s.
    refetchInterval: (query) => (query.state.data?.hasActive ? 5000 : false),
  });

export const newListingQueryOptions = (productId: string) =>
  queryOptions({
    queryKey: ["new-listing", productId],
    queryFn: () => getNewListingData({ data: { productId } }),
  });
