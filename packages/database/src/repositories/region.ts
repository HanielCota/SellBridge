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
  if (!row) {
    return null;
  }
  return row;
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
}

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
  };
}

export async function saveTenantRegion(
  database: Database,
  tenantId: string,
  address: ResolvedAddress,
): Promise<TenantRegion> {
  const values = {
    tenantId,
    cep: address.cep,
    state: address.state,
    city: address.city,
    neighborhood: address.neighborhood,
  };
  await database.insert(tenantProfile).values(values).onConflictDoUpdate({
    target: tenantProfile.tenantId,
    set: values,
  });
  return values;
}
