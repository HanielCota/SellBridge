import { ACTIVE_TARGET_STATUSES } from "@sellbridge/shared/listing-rules";
import { and, eq, gt, inArray, isNotNull, or } from "drizzle-orm";
import type { Database } from "../client.ts";
import { listingTargets } from "../schema/index.ts";

/**
 * How long after a description failed or was resent (`descriptionFailedAt`) the list keeps
 * polling: the sync
 * job picks it up within seconds, and the warning should go away without a reload (13.b).
 */
const DESCRIPTION_RESEND_POLL_MILLISECONDS = 5 * 60 * 1000;

/**
 * True while any of the tenant's targets is still pending or publishing, or has a description
 * resend asked for in the last minutes, so the UI keeps polling.
 */
export async function hasActiveTargets(database: Database, tenantId: string): Promise<boolean> {
  // One row is enough to answer: no need to count them all on every poll.
  const [row] = await database
    .select({ id: listingTargets.id })
    .from(listingTargets)
    .where(
      and(
        eq(listingTargets.tenantId, tenantId),
        or(
          inArray(listingTargets.status, [...ACTIVE_TARGET_STATUSES]),
          and(
            isNotNull(listingTargets.descriptionError),
            gt(
              listingTargets.descriptionFailedAt,
              new Date(Date.now() - DESCRIPTION_RESEND_POLL_MILLISECONDS),
            ),
          ),
        ),
      ),
    )
    .limit(1);
  return row !== undefined;
}
