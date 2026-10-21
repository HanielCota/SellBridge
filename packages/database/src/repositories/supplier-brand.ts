import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import type { AdminSupplierValues } from "@sellbridge/shared/schemas";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { isUniqueViolation } from "../postgres-errors.ts";
import { suppliers } from "../schema/index.ts";

/** One supplier per supplier profile (migration 0041). */
const PROFILE_SUPPLIER_INDEX = "suppliers_organization_id_unique";

const brandColumns = {
  id: suppliers.id,
  name: suppliers.name,
  niche: suppliers.niche,
  description: suppliers.description,
  state: suppliers.state,
  city: suppliers.city,
  contactEmail: suppliers.contactEmail,
  acceptWithinHours: suppliers.acceptWithinHours,
  dispatchWithinHours: suppliers.dispatchWithinHours,
  active: suppliers.active,
};

/** What a supplier sees and edits of its own catalog on "Dados da marca". */
export interface SupplierBrand {
  id: string;
  name: string;
  niche: string;
  description: string;
  state: string;
  city: string;
  contactEmail: string | null;
  acceptWithinHours: number;
  dispatchWithinHours: number;
  active: boolean;
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
  return found ?? null;
}

/** The brand step: creates the profile's supplier; a second one is refused. */
export async function createSupplierBrand(
  database: Database,
  input: BrandWrite,
): Promise<SupplierBrand> {
  try {
    const [created] = await database
      .insert(suppliers)
      .values({ ...editableValues(input.values), organizationId: input.organizationId })
      .returning(brandColumns);
    if (created === undefined) {
      throw new Error("Marca não criada");
    }
    return created;
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
  return updated;
}
