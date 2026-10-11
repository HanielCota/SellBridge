import {
  clearNotifications,
  listNotificationEvents,
  markNotificationsSeen,
} from "@sellbridge/database/repositories";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { reviewableSince } from "@/features/orders/review-window";
import { buildNotificationFeed } from "./notification-feed";
import { presentNotificationFeed } from "./notification-presenter";

export const getNotifications = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => {
    const { events, seenAt } = await listNotificationEvents(database, {
      tenantId: context.tenantId,
      userId: context.userId,
      reviewableSince: reviewableSince(new Date()),
    });
    return presentNotificationFeed(buildNotificationFeed(events, seenAt));
  });

export const markNotificationsSeenFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => {
    await markNotificationsSeen(database, context.userId);
    return { ok: true };
  });

export const clearNotificationsFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => {
    await clearNotifications(database, context.userId);
    return { ok: true };
  });
