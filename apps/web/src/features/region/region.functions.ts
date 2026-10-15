import {
  findTenantRegion,
  saveTenantRegion,
  type TenantRegion,
} from "@sellbridge/database/repositories";
import type { ResolvedAddress } from "@sellbridge/shared/cep";
import { logger } from "@sellbridge/shared/logger";
import { cepLookupSchema, updateRegionSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { resolveCep } from "@/features/region/region.server";

export const getTenantRegion = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<TenantRegion | null> => {
    return findTenantRegion(database, context.tenantId);
  });

/** Street, district, city and state of a CEP, to fill the address form. */
export const lookupAddress = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(cepLookupSchema)
  .handler(async ({ data }): Promise<ResolvedAddress> => resolveCep(data.cep));

export const updateTenantRegion = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(updateRegionSchema)
  .handler(async ({ context, data }): Promise<TenantRegion> => {
    // City and state come from the CEP, never from the form.
    const resolved = await resolveCep(data.cep);
    const region = await saveTenantRegion(database, context.tenantId, {
      ...resolved,
      street: data.street,
      number: data.number,
      complement: data.complement ?? null,
      neighborhood: data.neighborhood,
      holder: { fullName: data.fullName, cpf: data.cpf },
    });
    logger.info("region.updated", { tenantId: context.tenantId, state: region.state });
    return region;
  });
