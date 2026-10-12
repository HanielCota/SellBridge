import type { ResolvedAddress } from "@sellbridge/shared/cep";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { cepCache, tenantProfile } from "../schema/index.ts";

export interface CachedCep {
  cep: string;
  state: string;
  city: string;
  neighborhood: string | null;
  street: string | null;
  provider: string;
  fetchedAt: Date;
}

export async function findCachedCep(database: Database, cep: string): Promise<CachedCep | null> {
  const row = await database.query.cepCache.findFirst({ where: eq(cepCache.cep, cep) });
  return row ?? null;
}

export async function saveCachedCep(
  database: Database,
  address: ResolvedAddress,
  provider: string,
  payload: unknown,
): Promise<void> {
  const values = {
    cep: address.cep,
    state: address.state,
    city: address.city,
    neighborhood: address.neighborhood,
    street: address.street,
    provider,
    payload: payload ?? {},
    fetchedAt: new Date(),
  };
  await database.insert(cepCache).values(values).onConflictDoUpdate({
    target: cepCache.cep,
    set: values,
  });
}

export interface TenantRegion {
  tenantId: string;
  cep: string;
  state: string;
  city: string;
  neighborhood: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
}

/** A resolved CEP plus what only the tenant knows: house number and complement. */
export type TenantAddress = ResolvedAddress & {
  number?: string | null;
  complement?: string | null;
};

export async function findTenantRegion(
  database: Database,
  tenantId: string,
): Promise<TenantRegion | null> {
  const row = await database.query.tenantProfile.findFirst({
    where: eq(tenantProfile.tenantId, tenantId),
  });
  if (!row) {
    return null;
  }
  return {
    tenantId: row.tenantId,
    cep: row.cep,
    state: row.state,
    city: row.city,
    neighborhood: row.neighborhood,
    street: row.street,
    number: row.number,
    complement: row.complement,
  };
}

/**
 * Saves the tenant's address. A CEP-only change (admin, seed) clears the number and complement,
 * since they belonged to the previous street.
 */
export async function saveTenantRegion(
  database: Database,
  tenantId: string,
  address: TenantAddress,
): Promise<TenantRegion> {
  const values = {
    tenantId,
    cep: address.cep,
    state: address.state,
    city: address.city,
    neighborhood: address.neighborhood,
    street: address.street,
    number: address.number ?? null,
    complement: address.complement ?? null,
  };
  await database.insert(tenantProfile).values(values).onConflictDoUpdate({
    target: tenantProfile.tenantId,
    set: values,
  });
  return values;
}
