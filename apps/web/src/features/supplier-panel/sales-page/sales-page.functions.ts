import { reportPeriodSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import { loadSupplierSalesPage } from "./sales-page.server";

export const supplierSalesPageInputSchema = reportPeriodSearchSchema.extend({
  supplierId: z.uuid({ error: "Fornecedor inválido" }),
});

export const getSupplierSalesPageFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierSalesPageInputSchema)
  .handler(async ({ data }) => {
    const { supplierId, ...search } = data;
    return loadSupplierSalesPage(supplierId, search);
  });
