import type { OrderReviewSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getOrderPageFn, listOrderReviews } from "./orders.functions";

export const orderReviewsQueryOptions = (search: OrderReviewSearch) =>
  queryOptions({
    queryKey: ["order-reviews", search],
    queryFn: () => listOrderReviews({ data: search }),
    placeholderData: keepPreviousData,
  });

export const orderPageQueryOptions = (orderId: string) =>
  queryOptions({
    queryKey: ["order-page", orderId],
    queryFn: () => getOrderPageFn({ data: { orderId } }),
  });
