import type { ReviewQueueSearch } from "@sellbridge/shared/supplier-product-review";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  adminCountReviewQueue,
  adminGetReviewProduct,
  adminListReviewQueue,
} from "./review.functions";

const REFRESH_MILLISECONDS = 60_000;

/** Every query of the review flow starts with this key, so one invalidation refreshes them all. */
export const reviewQueueKey = ["admin-product-review"] as const;

export const reviewQueueQueryOptions = (search: ReviewQueueSearch) =>
  queryOptions({
    queryKey: [...reviewQueueKey, "list", search],
    queryFn: () => adminListReviewQueue({ data: search }),
    placeholderData: keepPreviousData,
  });

export const reviewProductQueryOptions = (productId: string) =>
  queryOptions({
    queryKey: [...reviewQueueKey, "product", productId],
    queryFn: () => adminGetReviewProduct({ data: { productId } }),
  });

export const reviewQueueCountQueryOptions = () =>
  queryOptions({
    queryKey: [...reviewQueueKey, "count"],
    queryFn: () => adminCountReviewQueue(),
    refetchInterval: REFRESH_MILLISECONDS,
  });
