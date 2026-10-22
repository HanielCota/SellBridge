import { queryOptions } from "@tanstack/react-query";
import { orderTrackingFn, parcelsInTransitFn } from "./order-tracking.functions";

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
