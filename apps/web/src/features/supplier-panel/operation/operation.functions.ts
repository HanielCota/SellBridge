import { createServerFn } from "@tanstack/react-start";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import { supplierOperationInputSchema } from "./operation-search";
import { loadSupplierOperation } from "./operation.server";

export const getSupplierOperationFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierOperationInputSchema)
  .handler(async ({ data }) => {
    const { supplierId, ...search } = data;
    return loadSupplierOperation(supplierId, search);
  });
