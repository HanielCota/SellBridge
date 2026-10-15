import type { ResolvedAddress } from "@sellbridge/shared/cep";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { isUniqueViolation } from "../postgres-errors.ts";
import { cepCache, suppliers, tenantProfile } from "../schema/index.ts";
import { assertActiveSupplier } from "./store-suppliers.ts";

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
  /** Billing holder (invoices and charges); null until the tenant fills it in. */
  fullName: string | null;
  cpf: string | null;
}

/** Who invoices and charges go to. */
export interface BillingHolder {
  fullName: string;
  cpf: string;
}

/** A resolved CEP plus what only the tenant knows: house number and complement. */
export type TenantAddress = ResolvedAddress & {
  number?: string | null;
  complement?: string | null;
  /** Left out by CEP-only changes (admin, seed), which keep the holder already saved. */
  holder?: BillingHolder;
};

/** The partial unique index of `schema/region.ts`: one account per CPF. */
const CPF_INDEX = "tenant_profile_cpf_idx";

const CPF_IN_USE_MESSAGE =
  "Este CPF já está cadastrado em outra conta do SellBridge. Se a conta é sua, fale com o suporte.";

/** Turns the CPF index refusing a row into the conflict the tenant sees; rethrows anything else. */
function rethrowCpfInUse(error: unknown): never {
  if (isUniqueViolation(error, CPF_INDEX)) {
    throw conflictError(CPF_IN_USE_MESSAGE);
  }
  throw error;
}

/** Null when the profile only holds the billing holder: the address is no longer asked for. */
function toTenantRegion(row: typeof tenantProfile.$inferSelect): TenantRegion | null {
  const { cep, state, city } = row;
  if (cep === null || state === null || city === null) {
    return null;
  }
  return {
    tenantId: row.tenantId,
    cep,
    state,
    city,
    neighborhood: row.neighborhood,
    street: row.street,
    number: row.number,
    complement: row.complement,
    fullName: row.fullName,
    cpf: row.cpf,
  };
}

export async function findTenantRegion(
  database: Database,
  tenantId: string,
): Promise<TenantRegion | null> {
  const row = await database.query.tenantProfile.findFirst({
    where: eq(tenantProfile.tenantId, tenantId),
  });
  if (row === undefined) {
    return null;
  }
  return toTenantRegion(row);
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
    ...address.holder,
  };
  const saved = await upsertTenantProfile(database, values);
  const region = toTenantRegion(saved);
  if (region === null) {
    // The values above always carry the address; this only narrows the type.
    throw notFoundError("Endereço não encontrado");
  }
  return region;
}

async function upsertTenantProfile(
  database: Database,
  values: typeof tenantProfile.$inferInsert,
): Promise<typeof tenantProfile.$inferSelect> {
  try {
    const [saved] = await database
      .insert(tenantProfile)
      .values(values)
      .onConflictDoUpdate({ target: tenantProfile.tenantId, set: values })
      .returning();
    if (saved === undefined) {
      // An upsert always returns its row; this only guards the destructuring.
      throw notFoundError("Cadastro não encontrado");
    }
    return saved;
  } catch (error) {
    return rethrowCpfInUse(error);
  }
}

export async function findBillingHolder(
  database: Database,
  tenantId: string,
): Promise<BillingHolder | null> {
  const row = await database.query.tenantProfile.findFirst({
    columns: { fullName: true, cpf: true },
    where: eq(tenantProfile.tenantId, tenantId),
  });
  if (row === undefined || row.fullName === null || row.cpf === null) {
    return null;
  }
  return { fullName: row.fullName, cpf: row.cpf };
}

/**
 * Saves who invoices and charges go to, keeping any address an older profile has. A CPF
 * already used by another account is refused with a conflict.
 */
export async function saveBillingHolder(
  database: Database,
  tenantId: string,
  holder: BillingHolder,
): Promise<BillingHolder> {
  const saved = await upsertTenantProfile(database, { tenantId, ...holder });
  return { fullName: saved.fullName ?? holder.fullName, cpf: saved.cpf ?? holder.cpf };
}

/** The supplier picked during onboarding, as the onboarding and profile screens show it. */
export interface StarterSupplier {
  id: string;
  name: string;
  niche: string;
  state: string;
  city: string;
  logoUrl: string | null;
}

/** What onboarding asks for: who invoices go to, and the supplier the first shop sells. */
export interface OnboardingProfile {
  holder: BillingHolder | null;
  starterSupplier: StarterSupplier | null;
}

export async function findOnboardingProfile(
  database: Database,
  tenantId: string,
): Promise<OnboardingProfile> {
  const [row] = await database
    .select({
      fullName: tenantProfile.fullName,
      cpf: tenantProfile.cpf,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      supplierNiche: suppliers.niche,
      supplierState: suppliers.state,
      supplierCity: suppliers.city,
      supplierLogoUrl: suppliers.logoUrl,
    })
    .from(tenantProfile)
    .leftJoin(suppliers, eq(suppliers.id, tenantProfile.starterSupplierId))
    .where(eq(tenantProfile.tenantId, tenantId))
    .limit(1);
  if (row === undefined) {
    return { holder: null, starterSupplier: null };
  }
  return { holder: holderOf(row), starterSupplier: starterSupplierOf(row) };
}

function holderOf(row: { fullName: string | null; cpf: string | null }): BillingHolder | null {
  if (row.fullName === null || row.cpf === null) {
    return null;
  }
  return { fullName: row.fullName, cpf: row.cpf };
}

function starterSupplierOf(row: {
  supplierId: string | null;
  supplierName: string | null;
  supplierNiche: string | null;
  supplierState: string | null;
  supplierCity: string | null;
  supplierLogoUrl: string | null;
}): StarterSupplier | null {
  const { supplierId, supplierName, supplierNiche, supplierState, supplierCity } = row;
  if (
    supplierId === null ||
    supplierName === null ||
    supplierNiche === null ||
    supplierState === null ||
    supplierCity === null
  ) {
    return null;
  }
  return {
    id: supplierId,
    name: supplierName,
    niche: supplierNiche,
    state: supplierState,
    city: supplierCity,
    logoUrl: row.supplierLogoUrl,
  };
}

/**
 * Saves the supplier picked during onboarding; the first shop the tenant connects sells it.
 * Only an active supplier can be picked.
 */
export async function saveStarterSupplier(
  database: Database,
  tenantId: string,
  supplierId: string,
): Promise<void> {
  await assertActiveSupplier(database, supplierId);
  await upsertTenantProfile(database, { tenantId, starterSupplierId: supplierId });
}
