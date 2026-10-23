import { queryOptions } from "@tanstack/react-query";
import { orderTrackingFn, parcelsInTransitFn, searchTrackingFn } from "./order-tracking.functions";

export const orderTrackingQueryOptions = (orderId: string) =>
  queryOptions({
    queryKey: ["order-tracking", orderId],
    queryFn: () => orderTrackingFn({ data: { orderId } }),
  });

export const parcelsInTransitQueryOptions = () =>
  queryOptions({
    queryKey: ["parcels-in-transit"],
    queryFn: () => parcelsInTransitFn(),
  });

/** A typed code or order number: kept in memory only, never in the address. */
export const trackingSearchQueryOptions = (query: string) =>
  queryOptions({
    queryKey: ["tracking-search", query],
    queryFn: () => searchTrackingFn({ data: { query } }),
  });
