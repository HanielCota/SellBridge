import {
  findCachedCep,
  findTenantRegion,
  saveCachedCep,
  saveTenantRegion,
  type TenantRegion,
} from "@sellbridge/db/repositories";
import { stateSchema, type ResolvedAddress } from "@sellbridge/shared/cep";
import { CEP_FAILURE_MESSAGES, lookupCep } from "@sellbridge/shared/cep-providers";
import { ValidationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { updateRegionSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { db } from "@/lib/server/db";
import { tenantMiddleware } from "@/lib/server/middleware";

const CEP_CACHE_TTL_MS = 30 * 86_400_000;

async function resolveFromCache(cep: string): Promise<ResolvedAddress | null> {
  const cached = await findCachedCep(db, cep);
  if (!cached) {
    return null;
  }
  const isFresh = Date.now() - cached.fetchedAt.getTime() < CEP_CACHE_TTL_MS;
  const state = stateSchema.safeParse(cached.state);
  if (!isFresh || !state.success) {
    return null;
  }
  return {
    cep: cached.cep,
    state: state.data,
    city: cached.city,
    neighborhood: cached.neighborhood,
    street: cached.street,
  };
}

async function resolveCep(cep: string): Promise<ResolvedAddress> {
  const cached = await resolveFromCache(cep);
  if (cached) {
    return cached;
  }
  const result = await lookupCep(cep);
  if (!result.ok) {
    logger.warn("cep.lookup_failed", { cep, reason: result.reason });
    throw new ValidationError(CEP_FAILURE_MESSAGES[result.reason]);
  }
  await saveCachedCep(db, result.address, result.provider, result.payload);
  return result.address;
}

export const getTenantRegion = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<TenantRegion | null> => {
    return findTenantRegion(db, context.tenantId);
  });

export const updateTenantRegion = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .inputValidator(updateRegionSchema)
  .handler(async ({ context, data }): Promise<TenantRegion> => {
    const address = await resolveCep(data.cep);
    const region = await saveTenantRegion(db, context.tenantId, address);
    logger.info("region.updated", { tenantId: context.tenantId, state: region.state });
    return region;
  });
