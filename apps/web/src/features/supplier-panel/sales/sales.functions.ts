import { createServerFn } from "@tanstack/react-start";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import { supplierSalesInputSchema } from "./sales-search";
import { loadSupplierSales } from "./sales.server";

export const getSupplierSalesFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierSalesInputSchema)
  .handler(async ({ data }) => {
    const { supplierId, ...search } = data;
    return loadSupplierSales(supplierId, search);
  });
