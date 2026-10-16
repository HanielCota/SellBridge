import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { isUniqueViolation } from "../postgres-errors.ts";
import { suppliers, tenantProfile } from "../schema/index.ts";
import { assertActiveSupplier } from "./store-suppliers.ts";

/** Who invoices and charges go to. */
export interface BillingHolder {
  fullName: string;
  cpf: string;
}

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

/** Saves who invoices and charges go to. A CPF already used by another account is refused. */
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
