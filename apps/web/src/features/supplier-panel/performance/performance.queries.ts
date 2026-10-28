import type { HealthMetricKey } from "@sellbridge/shared/supplier-panel-health";
import { queryOptions } from "@tanstack/react-query";
import { getPerformanceOrdersFn, getSupplierPerformanceFn } from "./performance.functions";

export const supplierPerformanceQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: ["supplier-panel", supplierId, "performance"],
    queryFn: () => getSupplierPerformanceFn({ data: { supplierId } }),
  });

export const performanceOrdersQueryOptions = (supplierId: string, metric: HealthMetricKey) =>
  queryOptions({
    queryKey: ["supplier-panel", supplierId, "performance", metric],
    queryFn: () => getPerformanceOrdersFn({ data: { supplierId, metric } }),
  });
