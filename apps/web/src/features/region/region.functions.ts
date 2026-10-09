import {
  findTenantRegion,
  saveTenantRegion,
  type TenantRegion,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { updateRegionSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { resolveCep } from "@/lib/server/region";

export const getTenantRegion = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<TenantRegion | null> => {
    return findTenantRegion(database, context.tenantId);
  });

export const updateTenantRegion = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(updateRegionSchema)
  .handler(async ({ context, data }): Promise<TenantRegion> => {
    const address = await resolveCep(data.cep);
    const region = await saveTenantRegion(database, context.tenantId, address);
    logger.info("region.updated", { tenantId: context.tenantId, state: region.state });
    return region;
  });
