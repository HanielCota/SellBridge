import type { StaffShipmentSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  countStaffShipmentsFn,
  listStaffShipmentsFn,
  staffParcelTrackingFn,
} from "./shipments.functions";

const STAFF_SHIPMENTS_REFRESH_MILLISECONDS = 60_000;

export const staffShipmentsQueryOptions = (search: Omit<StaffShipmentSearch, "shipment">) =>
  queryOptions({
    queryKey: ["admin", "shipments", "list", search],
    queryFn: () => listStaffShipmentsFn({ data: search }),
    placeholderData: keepPreviousData,
  });

/** Also the "Envios" nav badge: late and problem parcels are what the team must look at. */
export const staffShipmentCountsQueryOptions = () =>
  queryOptions({
    queryKey: ["admin", "shipments", "counts"],
    queryFn: () => countStaffShipmentsFn(),
    refetchInterval: STAFF_SHIPMENTS_REFRESH_MILLISECONDS,
  });

export const staffParcelTrackingQueryOptions = (shipmentId: string) =>
  queryOptions({
    queryKey: ["admin", "shipments", "tracking", shipmentId],
    queryFn: () => staffParcelTrackingFn({ data: { shipmentId } }),
  });
