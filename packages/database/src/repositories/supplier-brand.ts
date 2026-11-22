import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import type { AdminSupplierValues } from "@sellbridge/shared/schemas";
import {
  readSupplierFiscalProfile,
  type SupplierFiscalProfile,
  type SupplierTaxSetup,
} from "@sellbridge/shared/supplier-fiscal";
import type { FiscalFallback } from "@sellbridge/shared/product-fiscal";
import { eq } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import { isUniqueViolation } from "../postgres-errors.ts";
import { suppliers } from "../schema/index.ts";
import { startSupplierApproval } from "./supplier-approval.ts";

/** One supplier per supplier profile (migration 0041). */
const PROFILE_SUPPLIER_INDEX = "suppliers_organization_id_unique";

const brandColumns = {
  id: suppliers.id,
  name: suppliers.name,
  niche: suppliers.niche,
  description: suppliers.description,
  state: suppliers.state,
  city: suppliers.city,
  logoUrl: suppliers.logoUrl,
  contactEmail: suppliers.contactEmail,
  acceptWithinHours: suppliers.acceptWithinHours,
  dispatchWithinHours: suppliers.dispatchWithinHours,
  active: suppliers.active,
  fiscalProfile: suppliers.fiscalProfile,
};

/** What a supplier sees and edits of its own catalog on "Dados da marca". */
export interface SupplierBrand {
  id: string;
  name: string;
  niche: string;
  description: string;
  state: string;
  city: string;
  /** Set by the team; shown read-only in the brand's catalog preview. */
  logoUrl: string | null;
  contactEmail: string | null;
  acceptWithinHours: number;
  dispatchWithinHours: number;
  active: boolean;
  /** CNPJ, state registration, regime, fiscal address and tax defaults; null until filled. */
  fiscalProfile: SupplierFiscalProfile | null;
}

interface BrandWrite {
  organizationId: string;
  values: AdminSupplierValues;
}

/** The brand values a supplier may set; the logo and the active switch stay with the team. */
function editableValues(values: AdminSupplierValues) {
  const { logoUrl: _logoUrl, ...editable } = values;
  return editable;
}

/** The brand a supplier profile runs, or null before the brand step. */
export async function getSupplierBrand(
  database: Database,
  organizationId: string,
): Promise<SupplierBrand | null> {
  const [found] = await database
    .select(brandColumns)
    .from(suppliers)
    .where(eq(suppliers.organizationId, organizationId));
  if (found === undefined) {
    return null;
  }
  return { ...found, fiscalProfile: readSupplierFiscalProfile(found.fiscalProfile) };
}

/**
 * The brand step: creates the profile's supplier; a second one is refused. A supplier who signs
 * up alone starts pending: resellers only see it once the approval check or the team approves.
 */
export async function createSupplierBrand(
  database: Database,
  input: BrandWrite,
): Promise<SupplierBrand> {
  try {
    const created = await database.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(suppliers)
        .values({
          ...editableValues(input.values),
          organizationId: input.organizationId,
          approvalStatus: "pending",
        })
        .returning(brandColumns);
      if (row === undefined) {
        throw new Error("Marca não criada");
      }
      await startSupplierApproval(transaction, row.id);
      return row;
    });
    return { ...created, fiscalProfile: readSupplierFiscalProfile(created.fiscalProfile) };
  } catch (error) {
    if (isUniqueViolation(error, PROFILE_SUPPLIER_INDEX)) {
      throw conflictError("Esta conta já tem uma marca cadastrada. Edite os dados da marca.");
    }
    throw error;
  }
}

/** "Dados da marca": updates only the profile's own supplier. */
export async function updateSupplierBrand(
  database: Database,
  input: BrandWrite,
): Promise<SupplierBrand> {
  const [updated] = await database
    .update(suppliers)
    .set(editableValues(input.values))
    .where(eq(suppliers.organizationId, input.organizationId))
    .returning(brandColumns);
  if (updated === undefined) {
    throw notFoundError(
      `Nenhuma marca cadastrada para este perfil (perfil recebido: ${input.organizationId})`,
    );
  }
  return { ...updated, fiscalProfile: readSupplierFiscalProfile(updated.fiscalProfile) };
}

/** The origin and unit saved in Marca, which a product's NF-e uses when it has none. */
export async function getSupplierFiscalFallback(
  database: DatabaseExecutor,
  supplierId: string,
): Promise<FiscalFallback | null> {
  const setup = await getSupplierTaxDefaults(database, supplierId);
  return setup?.defaults ?? null;
}

/** The CNPJ in the supplier's "Dados fiscais da empresa", as stored; null until filled. */
export async function getSupplierCompanyCnpj(
  database: DatabaseExecutor,
  supplierId: string,
): Promise<string | null> {
  const [found] = await database
    .select({ fiscalProfile: suppliers.fiscalProfile })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId));
  return readSupplierFiscalProfile(found?.fiscalProfile ?? null)?.cnpj ?? null;
}

/** The supplier's regime and default tax codes, for its products' NF-e data; null until filled. */
export async function getSupplierTaxDefaults(
  database: DatabaseExecutor,
  supplierId: string,
): Promise<SupplierTaxSetup | null> {
  const [found] = await database
    .select({ fiscalProfile: suppliers.fiscalProfile })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId));
  const profile = readSupplierFiscalProfile(found?.fiscalProfile ?? null);
  return profile === null ? null : { regime: profile.regime, defaults: profile.defaults };
}
