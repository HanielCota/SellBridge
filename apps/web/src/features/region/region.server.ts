import { findCachedCep, saveCachedCep } from "@sellbridge/database/repositories";
import { stateSchema, type ResolvedAddress } from "@sellbridge/shared/cep";
import { CEP_FAILURE_MESSAGES, lookupCep } from "@sellbridge/shared/cep-providers";
import { validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";

const CEP_CACHE_TTL_MILLISECONDS = 30 * 86_400_000;

async function resolveFromCache(cep: string): Promise<ResolvedAddress | null> {
  const cached = await findCachedCep(database, cep);
  if (!cached) {
    return null;
  }
  const isFresh = Date.now() - cached.fetchedAt.getTime() < CEP_CACHE_TTL_MILLISECONDS;
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

/** Resolves a CEP through the cache first, then the public providers. */
export async function resolveCep(cep: string): Promise<ResolvedAddress> {
  const cached = await resolveFromCache(cep);
  if (cached) {
    return cached;
  }
  const result = await lookupCep(cep);
  if (!result.ok) {
    logger.warn("cep.lookup_failed", { reason: result.reason });
    throw validationError(CEP_FAILURE_MESSAGES[result.reason]);
  }
  await saveCachedCep(database, result.address, result.provider, result.payload);
  return result.address;
}
