import { and, count, eq, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { listingTargets } from "../schema/index.ts";

/** True while any of the tenant's targets is still pending or publishing. */
export async function hasActiveTargets(database: Database, tenantId: string): Promise<boolean> {
  const [row] = await database
    .select({ total: count() })
    .from(listingTargets)
    .where(
      and(
        eq(listingTargets.tenantId, tenantId),
        sql`${listingTargets.status} in ('pending', 'publishing')`,
      ),
    );
  return (row?.total ?? 0) > 0;
}
