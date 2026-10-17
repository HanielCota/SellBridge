import {
  notificationContentSchema,
  type NotificationContent,
  type QueuedNotificationChannel,
} from "@sellbridge/shared/notification-content";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { notificationDeliveries, user } from "../schema/index.ts";

/** Who gets a notice and on which queued channels (already filtered by their preferences). */
export interface NotificationRecipient {
  userId: string;
  channels: readonly QueuedNotificationChannel[];
}

export interface QueuedNotification {
  /** Null for team notices, which belong to no workspace. */
  tenantId: string | null;
  event: string;
  /** Names the fact ("order:<id>:paid"): the same fact queued twice notifies once. */
  dedupeKey: string;
  content: NotificationContent;
  recipients: readonly NotificationRecipient[];
}

/**
 * Queues one delivery per recipient and channel. Accepts a transaction, so a notice is queued
 * together with the change it reports, or not at all. Returns how many were new.
 */
export async function enqueueNotificationDeliveries(
  database: Pick<Database, "insert">,
  notice: QueuedNotification,
): Promise<number> {
  const content = notificationContentSchema.parse(notice.content);
  const rows = notice.recipients.flatMap((recipient) =>
    recipient.channels.map((channel) => ({
      tenantId: notice.tenantId,
      recipientId: recipient.userId,
      event: notice.event,
      channel,
      dedupeKey: notice.dedupeKey,
      content,
    })),
  );
  if (rows.length === 0) {
    return 0;
  }
  const inserted = await database
    .insert(notificationDeliveries)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: notificationDeliveries.id });
  return inserted.length;
}

/** A delivery the worker must make now, with everything its channel needs. */
export interface DueNotificationDelivery {
  id: string;
  tenantId: string | null;
  recipientId: string;
  recipientEmail: string;
  event: string;
  channel: QueuedNotificationChannel;
  /** Attempts already made before this one. */
  attempts: number;
  content: NotificationContent;
}

export interface NotificationDeliveryClaim {
  now: Date;
  limit: number;
  leaseMilliseconds: number;
  /** Only this organization's deliveries (tests); every one when absent. */
  tenantId?: string | undefined;
}

/**
 * Takes up to `limit` due deliveries and leases them, as `claimDueWebhookDeliveries` does: the
 * next attempt moves `leaseMilliseconds` ahead, and `SKIP LOCKED` keeps two workers apart.
 */
export async function claimDueNotificationDeliveries(
  database: Database,
  claim: NotificationDeliveryClaim,
): Promise<DueNotificationDelivery[]> {
  return database.transaction(async (transaction) => {
    const due = await transaction
      .select({
        id: notificationDeliveries.id,
        tenantId: notificationDeliveries.tenantId,
        recipientId: notificationDeliveries.recipientId,
        recipientEmail: user.email,
        event: notificationDeliveries.event,
        channel: notificationDeliveries.channel,
        attempts: notificationDeliveries.attempts,
        content: notificationDeliveries.content,
      })
      .from(notificationDeliveries)
      .innerJoin(user, eq(user.id, notificationDeliveries.recipientId))
      .where(
        and(
          eq(notificationDeliveries.status, "pending"),
          // Rows become due at Postgres now(); a worker clock behind the database must not
          // leave a just-queued delivery waiting a whole cycle (CI flake on PR #38).
          lte(
            notificationDeliveries.nextAttemptAt,
            sql`greatest(${claim.now.toISOString()}::timestamptz, now())`,
          ),
          claim.tenantId === undefined
            ? undefined
            : eq(notificationDeliveries.tenantId, claim.tenantId),
        ),
      )
      .orderBy(asc(notificationDeliveries.nextAttemptAt))
      .limit(claim.limit)
      .for("update", { of: notificationDeliveries, skipLocked: true });
    if (due.length === 0) {
      return [];
    }
    await transaction
      .update(notificationDeliveries)
      .set({ nextAttemptAt: new Date(claim.now.getTime() + claim.leaseMilliseconds) })
      .where(
        inArray(
          notificationDeliveries.id,
          due.map((delivery) => delivery.id),
        ),
      );
    return due.flatMap((delivery) => toDueDelivery(delivery));
  });
}

interface ClaimedRow extends Omit<DueNotificationDelivery, "channel" | "content"> {
  channel: "in_app" | QueuedNotificationChannel;
  content: unknown;
}

/** In-app rows are never queued; content is checked again since jsonb is untyped. */
function toDueDelivery(row: ClaimedRow): DueNotificationDelivery[] {
  const content = notificationContentSchema.safeParse(row.content);
  if (row.channel === "in_app" || !content.success) {
    return [];
  }
  return [{ ...row, channel: row.channel, content: content.data }];
}

/** Outcomes only apply to a delivery still pending (a late result after an expired lease). */
function stillPending(deliveryId: string) {
  return and(
    eq(notificationDeliveries.id, deliveryId),
    eq(notificationDeliveries.status, "pending"),
  );
}

const MAX_ERROR_LENGTH = 500;

export async function markNotificationSent(
  database: Database,
  deliveryId: string,
  now: Date,
): Promise<void> {
  await database
    .update(notificationDeliveries)
    .set({
      status: "sent",
      attempts: sql`${notificationDeliveries.attempts} + 1`,
      lastError: null,
      sentAt: now,
    })
    .where(stillPending(deliveryId));
}

/**
 * Records a failed attempt. `nextAttemptAt` is when to try again; null means attempts ran out
 * and the delivery is final ("failed").
 */
export async function markNotificationAttemptFailed(
  database: Database,
  deliveryId: string,
  failure: { error: string; nextAttemptAt: Date | null },
): Promise<void> {
  const retry = failure.nextAttemptAt === null ? {} : { nextAttemptAt: failure.nextAttemptAt };
  await database
    .update(notificationDeliveries)
    .set({
      ...retry,
      status: failure.nextAttemptAt === null ? "failed" : "pending",
      attempts: sql`${notificationDeliveries.attempts} + 1`,
      lastError: failure.error.slice(0, MAX_ERROR_LENGTH),
    })
    .where(stillPending(deliveryId));
}

/** The channel cannot deliver at all (push not configured): final, never retried. */
export async function markNotificationSkipped(
  database: Database,
  deliveryId: string,
  reason: string,
): Promise<void> {
  await database
    .update(notificationDeliveries)
    .set({ status: "skipped", lastError: reason.slice(0, MAX_ERROR_LENGTH) })
    .where(stillPending(deliveryId));
}
