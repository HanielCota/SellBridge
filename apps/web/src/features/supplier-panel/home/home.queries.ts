import type { HealthMetricKey } from "@sellbridge/shared/supplier-panel-health";
import { queryOptions } from "@tanstack/react-query";
import {
  getHealthDrillDownFn,
  getSupplierHomeFn,
  getSupplierPerformanceFn,
} from "./home.functions";

/** Deadlines move by the minute: the queue refreshes while the page stays open. */
const HOME_REFETCH_MILLISECONDS = 60_000;

export const supplierHomeQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: ["supplier-panel", supplierId, "home"],
    queryFn: () => getSupplierHomeFn({ data: { supplierId } }),
    refetchInterval: HOME_REFETCH_MILLISECONDS,
  });

export const supplierPerformanceQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: ["supplier-panel", supplierId, "performance"],
    queryFn: () => getSupplierPerformanceFn({ data: { supplierId } }),
  });

export const healthDrillDownQueryOptions = (supplierId: string, metric: HealthMetricKey) =>
  queryOptions({
    queryKey: ["supplier-panel", supplierId, "performance", metric],
    queryFn: () => getHealthDrillDownFn({ data: { supplierId, metric } }),
  });
