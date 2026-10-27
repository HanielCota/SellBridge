import { asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { member, suppliers } from "../schema/index.ts";

/**
 * The person to enter as when the team opens a supplier's account: the first member of the
 * supplier's profile, its owner. Null for a supplier the team registered without an account.
 */
export async function findSupplierAccountUserId(
  database: Database,
  supplierId: string,
): Promise<string | null> {
  const [account] = await database
    .select({ userId: member.userId })
    .from(suppliers)
    .innerJoin(member, eq(member.organizationId, suppliers.organizationId))
    .where(eq(suppliers.id, supplierId))
    .orderBy(asc(member.createdAt))
    .limit(1);
  return account?.userId ?? null;
}

/** Whether the supplier still runs its catalog; false once the team switched it off. */
export async function isSupplierActive(database: Database, supplierId: string): Promise<boolean> {
  const [found] = await database
    .select({ active: suppliers.active })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId));
  return found?.active ?? false;
}

/** The brand's contact e-mail (where order messages go), or null when it has none. */
export async function findSupplierContactEmail(
  database: Database,
  supplierId: string,
): Promise<string | null> {
  const [found] = await database
    .select({ contactEmail: suppliers.contactEmail })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId));
  return found?.contactEmail ?? null;
}
