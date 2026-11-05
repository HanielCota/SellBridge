import type {
  SupplierOrdersUrlSearch,
  SupplierShipmentCountsSearch,
  SupplierShipmentsSearch,
} from "@sellbridge/shared/supplier-panel-orders-schema";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  countSupplierShipmentsFn,
  getSupplierPanelShipmentFn,
  getSupplierParcelTrackingFn,
  listSupplierResellerStoresFn,
  listSupplierShipmentsFn,
} from "./orders.functions";

/** Everything under this key is the supplier's Pedidos: one invalidation refreshes it all. */
export const supplierOrdersKey = (supplierId: string) => ["supplier-panel", "orders", supplierId];

/** Deadlines count down by the minute and new parcels arrive: the queue refreshes itself. */
const QUEUE_REFRESH_MILLISECONDS = 30_000;

export const supplierShipmentsQueryOptions = (search: SupplierShipmentsSearch) =>
  queryOptions({
    queryKey: [...supplierOrdersKey(search.supplierId), "list", search],
    queryFn: () => listSupplierShipmentsFn({ data: search }),
    placeholderData: keepPreviousData,
    refetchInterval: QUEUE_REFRESH_MILLISECONDS,
  });

/** The list filters of the screen's address, as the server reads them (no tab, no page). */
export function shipmentFiltersOf(
  supplierId: string,
  search: SupplierOrdersUrlSearch,
): SupplierShipmentCountsSearch {
  return {
    supplierId,
    query: search.query ?? "",
    period: search.period,
    from: search.from,
    to: search.to,
    channel: search.channel,
    store: search.store,
    label: search.label,
  };
}

export const supplierShipmentCountsQueryOptions = (filters: SupplierShipmentCountsSearch) =>
  queryOptions({
    queryKey: [...supplierOrdersKey(filters.supplierId), "counts", filters],
    queryFn: () => countSupplierShipmentsFn({ data: filters }),
    placeholderData: keepPreviousData,
    refetchInterval: QUEUE_REFRESH_MILLISECONDS,
  });

export const supplierParcelTrackingQueryOptions = (supplierId: string, shipmentId: string) =>
  queryOptions({
    queryKey: [...supplierOrdersKey(supplierId), "tracking", shipmentId],
    queryFn: () => getSupplierParcelTrackingFn({ data: { supplierId, shipmentId } }),
  });

export const supplierPanelShipmentQueryOptions = (supplierId: string, shipmentId: string) =>
  queryOptions({
    queryKey: [...supplierOrdersKey(supplierId), "detail", shipmentId],
    queryFn: () => getSupplierPanelShipmentFn({ data: { supplierId, shipmentId } }),
    refetchInterval: 15_000,
  });

/** The reseller stores the supplier has orders from, for the store filter. */
export const supplierResellerStoresQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: [...supplierOrdersKey(supplierId), "stores"],
    queryFn: () => listSupplierResellerStoresFn({ data: { supplierId } }),
    staleTime: 5 * 60_000,
  });
