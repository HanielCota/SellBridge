import { HEALTH_METRICS } from "@sellbridge/shared/supplier-panel-health";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import { loadPerformanceOrders, loadSupplierPerformance } from "./performance.server";

export const supplierPerformanceInputSchema = z.object({
  supplierId: z.uuid({ error: "Fornecedor inválido" }),
});

export const performanceOrdersInputSchema = supplierPerformanceInputSchema.extend({
  metric: z.enum(HEALTH_METRICS, { error: "Métrica inválida" }),
});

export const getSupplierPerformanceFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierPerformanceInputSchema)
  .handler(async ({ data }) => loadSupplierPerformance(data.supplierId));

export const getPerformanceOrdersFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(performanceOrdersInputSchema)
  .handler(async ({ data }) => loadPerformanceOrders(data.supplierId, data.metric));
