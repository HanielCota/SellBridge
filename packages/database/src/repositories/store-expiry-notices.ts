import { and, eq, gte } from "drizzle-orm";
import type { Database } from "../client.ts";
import { member, notificationDeliveries, storeConnections, user } from "../schema/index.ts";
import type { Marketplace } from "./stores.ts";

export const STORE_EXPIRED_EVENT = "store_expired";

/** An owner to tell about one of their stores that lost its marketplace access. */
export interface ExpiredStoreRecipient {
  tenantId: string;
  storeId: string;
  shopName: string;
  marketplace: Marketplace;
  /** The connection's tokens, to tell one lost connection from the next (never sent anywhere). */
  connectionTokenEnc: string | null;
  recipientId: string;
  email: string;
}

/**
 * Owners of stores that expired since `since` (the status change bumps `updatedAt`). Bounded in
 * time so the first run after a deploy does not e-mail about stores that expired long ago.
 */
export async function findExpiredStoreRecipients(
  database: Database,
  since: Date,
): Promise<ExpiredStoreRecipient[]> {
  const rows = await database
    .select({
      tenantId: storeConnections.tenantId,
      storeId: storeConnections.id,
      shopName: storeConnections.shopName,
      marketplace: storeConnections.marketplace,
      accessTokenEnc: storeConnections.accessTokenEnc,
      refreshTokenEnc: storeConnections.refreshTokenEnc,
      recipientId: user.id,
      email: user.email,
    })
    .from(storeConnections)
    .innerJoin(member, eq(member.organizationId, storeConnections.tenantId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(storeConnections.status, "expired"),
        gte(storeConnections.updatedAt, since),
        eq(member.role, "owner"),
      ),
    );
  return rows.map(({ accessTokenEnc, refreshTokenEnc, ...row }) => ({
    ...row,
    connectionTokenEnc: accessTokenEnc ?? refreshTokenEnc,
  }));
}

/**
 * Claims the e-mail for one owner and one lost connection; false when it was already sent (the
 * unique dedupe key). Recorded as sent up front, so a concurrent run never sends it twice; a
 * failed send releases the claim with `releaseStoreExpiryNotice`.
 */
export async function claimStoreExpiryNotice(
  database: Database,
  notice: { tenantId: string; recipientId: string; dedupeKey: string; subject: string },
): Promise<string | null> {
  const [row] = await database
    .insert(notificationDeliveries)
    .values({
      tenantId: notice.tenantId,
      recipientId: notice.recipientId,
      event: STORE_EXPIRED_EVENT,
      channel: "email",
      dedupeKey: notice.dedupeKey,
      content: { subject: notice.subject },
      status: "sent",
      attempts: 1,
      sentAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: notificationDeliveries.id });
  return row?.id ?? null;
}

/** Gives the claim back after a failed send, so the next run tries again. */
export async function releaseStoreExpiryNotice(database: Database, id: string): Promise<void> {
  await database.delete(notificationDeliveries).where(eq(notificationDeliveries.id, id));
}
