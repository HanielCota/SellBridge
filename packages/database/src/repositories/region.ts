import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import {
  productSourceChoiceSchema,
  type ProductSourceChoice,
  type ProductSourceMode,
} from "@sellbridge/shared/product-sources";
import { and, eq } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import { isUniqueViolation } from "../postgres-errors.ts";
import { suppliers, tenantProfile } from "../schema/index.ts";
import { publicSupplier } from "./sql/sellable.ts";

/** Who sells as a company: CNPJ (digits) and legal name. */
export interface HolderCompany {
  cnpj: string;
  companyName: string;
}

/** Who invoices and charges go to, and how to reach them. */
export interface BillingHolder {
  fullName: string;
  cpf: string;
  /** Digits with area code; null for accounts saved before it was asked (item 26.a). */
  phone: string | null;
  company: HolderCompany | null;
}

/** What onboarding saves; phone and company left out keep what is stored. */
export interface BillingHolderValues {
  fullName: string;
  cpf: string;
  phone?: string;
  company?: HolderCompany | null;
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
  database: DatabaseExecutor,
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
    columns: { fullName: true, cpf: true, phone: true, cnpj: true, companyName: true },
    where: eq(tenantProfile.tenantId, tenantId),
  });
  if (row === undefined) {
    return null;
  }
  return holderOf(row);
}

function profileValuesOf(holder: BillingHolderValues) {
  const { company, ...person } = holder;
  if (company === undefined) {
    return person;
  }
  return { ...person, cnpj: company?.cnpj ?? null, companyName: company?.companyName ?? null };
}

/** Saves who invoices and charges go to. A CPF already used by another account is refused. */
export async function saveBillingHolder(
  database: Database,
  tenantId: string,
  holder: BillingHolderValues,
): Promise<BillingHolder> {
  const saved = await upsertTenantProfile(database, { tenantId, ...profileValuesOf(holder) });
  return (
    holderOf(saved) ?? { fullName: holder.fullName, cpf: holder.cpf, phone: null, company: null }
  );
}

/** The supplier picked during onboarding, as the onboarding and profile screens show it. */
export interface StarterSupplier {
  id: string;
  active: boolean;
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
  productSourceMode: ProductSourceMode | null;
}

export async function findOnboardingProfile(
  database: Database,
  tenantId: string,
): Promise<OnboardingProfile> {
  const [row] = await database
    .select({
      fullName: tenantProfile.fullName,
      cpf: tenantProfile.cpf,
      phone: tenantProfile.phone,
      cnpj: tenantProfile.cnpj,
      companyName: tenantProfile.companyName,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      supplierNiche: suppliers.niche,
      supplierState: suppliers.state,
      supplierCity: suppliers.city,
      supplierLogoUrl: suppliers.logoUrl,
      supplierActive: suppliers.active,
      productSourceMode: tenantProfile.productSourceMode,
    })
    .from(tenantProfile)
    .leftJoin(suppliers, and(eq(suppliers.id, tenantProfile.starterSupplierId), publicSupplier()))
    .where(eq(tenantProfile.tenantId, tenantId))
    .limit(1);
  if (row === undefined) {
    return { holder: null, starterSupplier: null, productSourceMode: null };
  }
  return {
    holder: holderOf(row),
    starterSupplier: starterSupplierOf(row),
    productSourceMode: row.productSourceMode ?? (row.supplierId === null ? null : "suppliers"),
  };
}

function holderOf(row: {
  fullName: string | null;
  cpf: string | null;
  phone: string | null;
  cnpj: string | null;
  companyName: string | null;
}): BillingHolder | null {
  if (row.fullName === null || row.cpf === null) {
    return null;
  }
  const company =
    row.cnpj === null || row.companyName === null
      ? null
      : { cnpj: row.cnpj, companyName: row.companyName };
  return { fullName: row.fullName, cpf: row.cpf, phone: row.phone, company };
}

function starterSupplierOf(row: {
  supplierActive: boolean | null;
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
    active: row.supplierActive === true,
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
  await saveProductSourceChoice(database, tenantId, { mode: "suppliers", supplierId });
}

/** Changes future setup defaults without rewriting existing stores, listings, or orders. */
export async function saveProductSourceChoice(
  database: Database,
  tenantId: string,
  input: ProductSourceChoice,
): Promise<void> {
  const choice = productSourceChoiceSchema.parse(input);
  await database.transaction(async (transaction) => {
    const supplierId = choice.mode === "own" ? null : (choice.supplierId ?? null);
    if (supplierId !== null) {
      const [supplier] = await transaction
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(eq(suppliers.id, supplierId), eq(suppliers.active, true), publicSupplier()))
        .for("share");
      if (supplier === undefined) throw notFoundError("Supplier not found or inactive.");
    }
    await upsertTenantProfile(transaction, {
      tenantId,
      productSourceMode: choice.mode,
      starterSupplierId: supplierId,
    });
  });
}
