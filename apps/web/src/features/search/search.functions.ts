import { findTenantRegion, searchEverything } from "@sellbridge/database/repositories";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";

export const searchEverythingFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ query: z.string().trim().min(2).max(100) }))
  .handler(async ({ context, data }) => {
    const region = await findTenantRegion(database, context.tenantId);
    return searchEverything(database, { tenantId: context.tenantId, region }, data.query);
  });
