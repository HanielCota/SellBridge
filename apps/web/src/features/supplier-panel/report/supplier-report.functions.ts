import { reportPeriodSearchSchema } from "@sellbridge/shared/schemas";
import { supplierIdSchema } from "@sellbridge/shared/supplier-panel-orders-schema";
import { createServerFn } from "@tanstack/react-start";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import { loadSupplierReport } from "./supplier-report.server";

export const supplierReportInputSchema = reportPeriodSearchSchema.extend({
  supplierId: supplierIdSchema,
});

export const getSupplierReportFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierReportInputSchema)
  .handler(async ({ data }) => {
    const { supplierId, ...search } = data;
    return loadSupplierReport({ supplierId, search });
  });
