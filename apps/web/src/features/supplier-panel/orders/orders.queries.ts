import type { SupplierShipmentsSearch } from "@sellbridge/shared/supplier-panel-orders-schema";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  countSupplierShipmentsFn,
  getSupplierPanelShipmentFn,
  getSupplierParcelTrackingFn,
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

export const supplierShipmentCountsQueryOptions = (supplierId: string, query: string) =>
  queryOptions({
    queryKey: [...supplierOrdersKey(supplierId), "counts", query],
    queryFn: () => countSupplierShipmentsFn({ data: { supplierId, query } }),
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
