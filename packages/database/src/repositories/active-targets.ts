import { ACTIVE_TARGET_STATUSES } from "@sellbridge/shared/listing-rules";
import { and, count, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import { listingTargets } from "../schema/index.ts";

/** True while any of the tenant's targets is still pending or publishing, so the UI keeps polling. */
export async function hasActiveTargets(database: Database, tenantId: string): Promise<boolean> {
  const [row] = await database
    .select({ total: count() })
    .from(listingTargets)
    .where(
      and(
        eq(listingTargets.tenantId, tenantId),
        inArray(listingTargets.status, [...ACTIVE_TARGET_STATUSES]),
      ),
    );
  return (row?.total ?? 0) > 0;
}
