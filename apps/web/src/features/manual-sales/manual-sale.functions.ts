import { manualSaleSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { tenantMiddleware } from "@/lib/server/middleware";
import { recordManualSale, searchManualSaleProducts } from "./manual-sale.server";

const MAX_SEARCH_LENGTH = 100;

export const searchManualSaleProductsFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ query: z.string().trim().max(MAX_SEARCH_LENGTH) }))
  .handler(({ context, data }) => searchManualSaleProducts(context.tenantId, data.query));

export const recordManualSaleFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(manualSaleSchema)
  .handler(({ context, data }) => recordManualSale(context.tenantId, data));
