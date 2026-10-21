import { and, asc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  listings,
  listingTargets,
  listingTargetStatusEnum,
  storeConnections,
} from "../schema/index.ts";

/**
 * Descriptions a marketplace refused while the listing went live (item 13.b). The listing stays
 * on sale; the sync job resends the description a few times, then only the reseller's
 * "Reenviar descrição" starts it again.
 */

/** Automatic resends before the job leaves a description to the reseller. */
export const DESCRIPTION_AUTOMATIC_ATTEMPTS = 3;

/** A description goes to a listing that exists on the marketplace: live or paused. */
const DESCRIPTION_STATUSES = [
  "published",
  "paused",
] as const satisfies readonly (typeof listingTargetStatusEnum.enumValues)[number][];

export interface TargetWithPendingDescription {
  targetId: string;
  externalId: string;
  plainText: string;
  store: typeof storeConnections.$inferSelect;
}

/** Live listings whose description is still missing, oldest failure first. */
export async function findTargetsWithPendingDescription(
  database: Database,
  limit = 50,
): Promise<TargetWithPendingDescription[]> {
  const rows = await database
    .select({
      targetId: listingTargets.id,
      externalId: listingTargets.externalId,
      plainText: listings.description,
      store: storeConnections,
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(
      and(
        isNotNull(listingTargets.descriptionError),
        lt(listingTargets.descriptionAttempts, DESCRIPTION_AUTOMATIC_ATTEMPTS),
        inArray(listingTargets.status, [...DESCRIPTION_STATUSES]),
        eq(storeConnections.status, "connected"),
        isNotNull(listingTargets.externalId),
      ),
    )
    .orderBy(asc(listingTargets.descriptionFailedAt), asc(listingTargets.id))
    .limit(limit);
  return rows.flatMap((row) =>
    row.externalId === null ? [] : [{ ...row, externalId: row.externalId }],
  );
}

/** The description went through: the warning goes away. */
export async function markDescriptionSent(database: Database, targetId: string): Promise<void> {
  await database
    .update(listingTargets)
    .set({ descriptionError: null, descriptionFailedAt: null, descriptionAttempts: 0 })
    .where(eq(listingTargets.id, targetId));
}

/**
 * One more automatic resend failed; past the limit the job stops trying on its own. A refusal
 * that cannot pass by trying again (the marketplace refused the text itself) reaches it at once.
 */
export async function markDescriptionFailed(
  database: Database,
  targetId: string,
  failure: { reason: string; retryable: boolean },
): Promise<void> {
  const attempts = failure.retryable
    ? sql`${listingTargets.descriptionAttempts} + 1`
    : sql.raw(String(DESCRIPTION_AUTOMATIC_ATTEMPTS));
  await database
    .update(listingTargets)
    .set({ descriptionError: failure.reason, descriptionAttempts: attempts })
    .where(eq(listingTargets.id, targetId));
}

/**
 * The reseller's "Reenviar descrição": the tenant's listings with a missing description go back
 * to the automatic resends. Returns how many stores will be tried again.
 */
export async function requestDescriptionResend(
  database: Database,
  tenantId: string,
  listingIds: readonly string[],
): Promise<number> {
  if (listingIds.length === 0) {
    return 0;
  }
  // Only listings on the marketplace through a connected store: anything else would say
  // "reenviada" and send nothing.
  const connected = database
    .select({ id: storeConnections.id })
    .from(storeConnections)
    .where(and(eq(storeConnections.tenantId, tenantId), eq(storeConnections.status, "connected")));
  const reset = await database
    .update(listingTargets)
    // Dated now: the list keeps polling a few minutes, so the warning leaves without a reload.
    .set({ descriptionAttempts: 0, descriptionFailedAt: new Date() })
    .where(
      and(
        eq(listingTargets.tenantId, tenantId),
        inArray(listingTargets.listingId, [...listingIds]),
        isNotNull(listingTargets.descriptionError),
        inArray(listingTargets.status, [...DESCRIPTION_STATUSES]),
        inArray(listingTargets.storeConnectionId, connected),
      ),
    )
    .returning({ id: listingTargets.id });
  return reset.length;
}
