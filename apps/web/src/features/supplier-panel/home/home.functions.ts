import { HEALTH_METRICS } from "@sellbridge/shared/supplier-panel-health";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import { loadHealthDrillDown, loadSupplierHome, loadSupplierPerformance } from "./home.server";

export const supplierHomeInputSchema = z.object({
  supplierId: z.uuid({ error: "Fornecedor inválido" }),
});

export const healthDrillDownInputSchema = supplierHomeInputSchema.extend({
  metric: z.enum(HEALTH_METRICS, { error: "Métrica inválida" }),
});

export const getSupplierHomeFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierHomeInputSchema)
  .handler(async ({ data }) => loadSupplierHome(data.supplierId));

export const getSupplierPerformanceFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierHomeInputSchema)
  .handler(async ({ data }) => loadSupplierPerformance(data.supplierId));

export const getHealthDrillDownFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(healthDrillDownInputSchema)
  .handler(async ({ data }) => loadHealthDrillDown(data.supplierId, data.metric));
