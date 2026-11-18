import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { and, count, eq, isNull } from "drizzle-orm";
import type { Database } from "../client.ts";
import { isUniqueViolation } from "../postgres-errors.ts";
import { organization, suppliers } from "../schema/index.ts";

/** One supplier per supplier profile (migration 0041). */
const PROFILE_SUPPLIER_INDEX = "suppliers_organization_id_unique";

/** What the invite page and the claim need to know about the invited supplier. */
export interface SupplierInviteTarget {
  id: string;
  name: string;
  /** Where the order e-mails go: only an account with this e-mail, confirmed, may claim it. */
  contactEmail: string | null;
  /** Whether a supplier profile already runs it from the panel. */
  hasPanel: boolean;
  active: boolean;
}

/** A supplier of the directory (never a seller's private catalog), or null. */
export async function getSupplierInviteTarget(
  database: Database,
  supplierId: string,
): Promise<SupplierInviteTarget | null> {
  const [found] = await database
    .select({
      id: suppliers.id,
      name: suppliers.name,
      contactEmail: suppliers.contactEmail,
      organizationId: suppliers.organizationId,
      active: suppliers.active,
    })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.catalogKind, "supplier")));
  if (found === undefined) {
    return null;
  }
  const { organizationId, ...target } = found;
  return { ...target, hasPanel: organizationId !== null };
}

/**
 * Hands a team-managed supplier, with its products and orders, to a supplier profile. Only a
 * supplier still without an owner moves, so two claims never both win.
 *
 * @throws {AppError} `NOT_FOUND` when the profile is not a supplier profile.
 * @throws {AppError} `CONFLICT` when the supplier already has an owner, or the profile already
 * runs a brand of its own.
 */
export async function claimSupplierForProfile(
  database: Database,
  input: { supplierId: string; organizationId: string },
): Promise<void> {
  const [profile] = await database
    .select({ kind: organization.kind })
    .from(organization)
    .where(eq(organization.id, input.organizationId));
  if (profile?.kind !== "supplier") {
    throw notFoundError(`Perfil de fornecedor não encontrado (perfil: ${input.organizationId})`);
  }
  try {
    const [claimed] = await database
      .update(suppliers)
      .set({ organizationId: input.organizationId })
      .where(
        and(
          eq(suppliers.id, input.supplierId),
          eq(suppliers.catalogKind, "supplier"),
          isNull(suppliers.organizationId),
        ),
      )
      .returning({ id: suppliers.id });
    if (claimed === undefined) {
      throw conflictError("Este fornecedor já tem acesso ao painel. Entre com a conta dele.");
    }
  } catch (error) {
    if (isUniqueViolation(error, PROFILE_SUPPLIER_INDEX)) {
      throw conflictError(
        "Esta conta já tem uma marca cadastrada. Fale com o suporte para juntar os cadastros.",
      );
    }
    throw error;
  }
}

/** Active directory suppliers the team still runs for them: no one has a panel login yet. */
export async function countSuppliersWithoutPanel(database: Database): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(suppliers)
    .where(
      and(
        eq(suppliers.catalogKind, "supplier"),
        eq(suppliers.active, true),
        isNull(suppliers.organizationId),
      ),
    );
  return row?.total ?? 0;
}
