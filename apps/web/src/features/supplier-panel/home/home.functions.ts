import { HEALTH_METRICS } from "@sellbridge/shared/supplier-panel-health";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminMiddleware } from "@/lib/server/middleware";
import { loadHealthDrillDown, loadSupplierHome, loadSupplierPerformance } from "./home.server";

/*
 * TEMPORARY GATE: the supplier login is built in another chat. Until its supplier middleware
 * exists, these functions only answer platform admins, so a `supplierId` sent by anyone else
 * reaches nothing. The access work swaps `adminMiddleware` for the supplier one and checks that
 * the `supplierId` is the session's own.
 */
const panelMiddleware = adminMiddleware;

export const supplierHomeInputSchema = z.object({
  supplierId: z.uuid({ error: "Fornecedor inválido" }),
});

export const healthDrillDownInputSchema = supplierHomeInputSchema.extend({
  metric: z.enum(HEALTH_METRICS, { error: "Métrica inválida" }),
});

export const getSupplierHomeFn = createServerFn({ method: "GET" })
  .middleware([panelMiddleware])
  .validator(supplierHomeInputSchema)
  .handler(async ({ data }) => loadSupplierHome(data.supplierId));

export const getSupplierPerformanceFn = createServerFn({ method: "GET" })
  .middleware([panelMiddleware])
  .validator(supplierHomeInputSchema)
  .handler(async ({ data }) => loadSupplierPerformance(data.supplierId));

export const getHealthDrillDownFn = createServerFn({ method: "GET" })
  .middleware([panelMiddleware])
  .validator(healthDrillDownInputSchema)
  .handler(async ({ data }) => loadHealthDrillDown(data.supplierId, data.metric));
