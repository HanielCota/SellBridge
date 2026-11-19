import { conflictError } from "@sellbridge/shared/errors";
import { and, asc, count, eq, exists, isNull, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { isUniqueViolation } from "../postgres-errors.ts";
import { member, organization, suppliers, user } from "../schema/index.ts";

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
 * Hands a team-managed supplier, with its products and orders, to a supplier profile. Only an
 * active supplier still without an owner moves. The verified contact and ownership must match
 * at the write, since either can change after opening the invite.
 *
 * @throws {AppError} `CONFLICT` when the supplier or claimant is no longer eligible.
 */
export async function claimSupplierForProfile(
  database: Database,
  input: { supplierId: string; organizationId: string; userId: string },
): Promise<void> {
  const verifiedOwner = database
    .select({ id: member.id })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, input.organizationId),
        eq(member.userId, input.userId),
        eq(member.role, "owner"),
        eq(organization.kind, "supplier"),
        eq(user.emailVerified, true),
        sql`lower(btrim(${user.email})) = lower(btrim(${suppliers.contactEmail}))`,
      ),
    );

  try {
    const [claimed] = await database
      .update(suppliers)
      .set({ organizationId: input.organizationId })
      .where(
        and(
          eq(suppliers.id, input.supplierId),
          eq(suppliers.catalogKind, "supplier"),
          eq(suppliers.active, true),
          isNull(suppliers.organizationId),
          exists(verifiedOwner),
        ),
      )
      .returning({ id: suppliers.id });
    if (claimed === undefined) {
      throw conflictError(
        "Não foi possível vincular o fornecedor. Confira o e-mail de pedidos e o acesso ao perfil de fornecedor.",
      );
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

/** Where an accepted invite lands: the person's own supplier profile that has no brand yet. */
export type ClaimingProfile =
  | { status: "found"; organizationId: string; slug: string }
  | { status: "no_supplier_profile" }
  | { status: "has_brand" };

/** The oldest supplier profile the user owns without a brand, or why there is none. */
export async function findClaimingProfile(
  database: Database,
  userId: string,
): Promise<ClaimingProfile> {
  const owned = await database
    .select({ id: organization.id, slug: organization.slug, brandId: suppliers.id })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .leftJoin(suppliers, eq(suppliers.organizationId, organization.id))
    .where(
      and(eq(member.userId, userId), eq(member.role, "owner"), eq(organization.kind, "supplier")),
    )
    .orderBy(asc(member.createdAt), asc(organization.id));
  if (owned.length === 0) {
    return { status: "no_supplier_profile" };
  }
  const free = owned.find((profile) => profile.brandId === null);
  if (free === undefined) {
    return { status: "has_brand" };
  }
  return { status: "found", organizationId: free.id, slug: free.slug };
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
