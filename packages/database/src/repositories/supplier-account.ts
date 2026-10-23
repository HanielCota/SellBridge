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
