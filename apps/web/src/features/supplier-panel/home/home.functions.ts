import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import { loadSupplierHome } from "./home.server";

export const supplierHomeInputSchema = z.object({
  supplierId: z.uuid({ error: "Fornecedor inválido" }),
});

export const getSupplierHomeFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierHomeInputSchema)
  .handler(async ({ data }) => loadSupplierHome(data.supplierId));
