import { logger } from "@sellbridge/shared/logger";
import {
  notificationContentSchema,
  QUEUED_NOTIFICATION_CHANNELS,
  type NotificationContent,
  type QueuedNotificationChannel,
} from "@sellbridge/shared/notification-content";
import {
  channelEnabled,
  listingFailedContent,
  orderDeliveredContent,
  salePaidContent,
  storeExpiredContent,
  type NotificationEventName,
} from "@sellbridge/shared/notification-events";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import {
  listings,
  listingTargets,
  member,
  notificationPreferences,
  orderItems,
  orders,
  storeConnections,
} from "../schema/index.ts";
import {
  enqueueNotificationDeliveries,
  type NotificationRecipient,
} from "./notification-deliveries.ts";

/**
 * Facts older than this are history the sync is catching up on (a new store's past sales), not
 * news: nobody wants 400 "venda paga" e-mails after connecting a store.
 */
const NEWS_WINDOW_MILLISECONDS = 24 * 60 * 60 * 1000;

export interface WorkspaceNotice {
  tenantId: string;
  event: NotificationEventName;
  dedupeKey: string;
  content: NotificationContent;
}

/** The queued channels each person wants for the event (saved choice, else the default). */
export async function resolveNotificationRecipients(
  database: DatabaseExecutor,
  userIds: readonly string[],
  event: NotificationEventName,
): Promise<NotificationRecipient[]> {
  if (userIds.length === 0) {
    return [];
  }
  const saved = await database
    .select({
      userId: notificationPreferences.userId,
      channel: notificationPreferences.channel,
      enabled: notificationPreferences.enabled,
    })
    .from(notificationPreferences)
    .where(
      and(
        inArray(notificationPreferences.userId, [...userIds]),
        eq(notificationPreferences.event, event),
      ),
    );
  const choiceOf = (userId: string, channel: QueuedNotificationChannel) =>
    saved.find((row) => row.userId === userId && row.channel === channel)?.enabled;
  return userIds
    .map((userId) => ({
      userId,
      channels: QUEUED_NOTIFICATION_CHANNELS.filter((channel) =>
        channelEnabled(event, channel, choiceOf(userId, channel)),
      ),
    }))
    .filter((recipient) => recipient.channels.length > 0);
}

/**
 * Queues a notice to every member of the workspace, inside the caller's transaction, and returns
 * how many deliveries were new. A notice
 * that fails validation (a title too long for a subject) is logged and dropped: it must never
 * undo the order, store or listing change that caused it.
 */
export async function notifyWorkspace(
  database: DatabaseExecutor,
  notice: WorkspaceNotice,
): Promise<number> {
  const content = notificationContentSchema.safeParse(notice.content);
  if (!content.success) {
    logger.error("notification.invalid_content", {
      event: notice.event,
      dedupeKey: notice.dedupeKey,
    });
    return 0;
  }
  const members = await database
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, notice.tenantId));
  const recipients = await resolveNotificationRecipients(
    database,
    members.map((row) => row.userId),
    notice.event,
  );
  return enqueueNotificationDeliveries(database, {
    tenantId: notice.tenantId,
    event: notice.event,
    dedupeKey: notice.dedupeKey,
    content: content.data,
    recipients,
  });
}

/** Long marketplace titles still fit a subject line. */
export function clipText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

const TITLE_LENGTH = 80;

async function salePaidNotice(database: DatabaseExecutor, tenantId: string, orderId: string) {
  const [order] = await database
    .select({ externalOrderId: orders.externalOrderId, totalCents: orders.totalCents })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));
  if (order === undefined) {
    return null;
  }
  const items = await database
    .select({ title: orderItems.title })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.tenantId, tenantId)))
    .orderBy(asc(orderItems.id));
  const firstTitle = items[0]?.title;
  return salePaidContent({
    orderId,
    externalOrderId: order.externalOrderId,
    totalCents: order.totalCents,
    firstItemTitle: firstTitle === undefined ? null : clipText(firstTitle, TITLE_LENGTH),
    itemCount: items.length,
  });
}

async function orderDeliveredNotice(database: DatabaseExecutor, tenantId: string, orderId: string) {
  const [order] = await database
    .select({ externalOrderId: orders.externalOrderId })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));
  return order === undefined ? null : orderDeliveredContent({ orderId, ...order });
}

/**
 * Called whenever an order enters a status (`recordOrderStatusChange`): a paid or delivered order
 * notifies the workspace, unless the change is history the sync is importing.
 */
export async function notifyOrderStatus(
  database: DatabaseExecutor,
  change: { tenantId: string; orderId: string; status: string; at: Date; now: Date },
): Promise<void> {
  if (change.now.getTime() - change.at.getTime() > NEWS_WINDOW_MILLISECONDS) {
    return;
  }
  if (change.status !== "paid" && change.status !== "delivered") {
    return;
  }
  const event = change.status === "paid" ? "sale_paid" : "order_delivered";
  const content =
    change.status === "paid"
      ? await salePaidNotice(database, change.tenantId, change.orderId)
      : await orderDeliveredNotice(database, change.tenantId, change.orderId);
  if (content === null) {
    return;
  }
  await notifyWorkspace(database, {
    tenantId: change.tenantId,
    event,
    dedupeKey: `order:${change.orderId}:${change.status}`,
    content,
  });
}

/** A connected store just expired; one notice per expiry (keyed by when it happened). */
export async function notifyStoreExpired(
  database: DatabaseExecutor,
  storeConnectionId: string,
  at: Date,
): Promise<void> {
  const [store] = await database
    .select({ tenantId: storeConnections.tenantId, shopName: storeConnections.shopName })
    .from(storeConnections)
    .where(eq(storeConnections.id, storeConnectionId));
  if (store === undefined) {
    return;
  }
  await notifyWorkspace(database, {
    tenantId: store.tenantId,
    event: "store_expired",
    dedupeKey: `store:${storeConnectionId}:expired:${at.toISOString()}`,
    content: storeExpiredContent({
      storeName: clipText(store.shopName, TITLE_LENGTH),
    }),
  });
}

/** A publication failed for good; one notice per failure (keyed by when it happened). */
export async function notifyListingFailed(
  database: DatabaseExecutor,
  listingTargetId: string,
  at: Date,
): Promise<void> {
  const [target] = await database
    .select({
      tenantId: listingTargets.tenantId,
      title: listings.title,
      reason: listingTargets.errorReason,
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .where(eq(listingTargets.id, listingTargetId));
  if (target === undefined) {
    return;
  }
  await notifyWorkspace(database, {
    tenantId: target.tenantId,
    event: "listing_failed",
    dedupeKey: `listing-target:${listingTargetId}:failed:${at.toISOString()}`,
    content: listingFailedContent({
      listingTitle: clipText(target.title, TITLE_LENGTH),
      reason: target.reason === null ? null : clipText(target.reason, 900),
    }),
  });
}
