import {
  clearNotifications,
  listNotificationEvents,
  listNotificationPreferences,
  markNotificationsSeen,
} from "@sellbridge/database/repositories";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { accountMiddleware } from "@/lib/server/middleware";
import { reviewableSince } from "@/features/orders/review-window";
import { buildNotificationFeed } from "./notification-feed";
import { hiddenNotificationKinds } from "./notification-preferences";
import { presentNotificationFeed } from "./notification-presenter";

export const getNotifications = createServerFn({ method: "GET" })
  .middleware([accountMiddleware])
  .handler(async ({ context }) => {
    const [{ events, seenAt }, preferences] = await Promise.all([
      listNotificationEvents(database, {
        tenantId: context.tenantId,
        userId: context.userId,
        reviewableSince: reviewableSince(new Date()),
      }),
      listNotificationPreferences(database, context.userId),
    ]);
    // Kinds turned off in Perfil › Notificações neither show nor count as unread.
    const hidden = hiddenNotificationKinds(preferences);
    const shown = events.filter((event) => !hidden.has(event.kind));
    return presentNotificationFeed(buildNotificationFeed(shown, seenAt));
  });

export const markNotificationsSeenFn = createServerFn({ method: "POST" })
  .middleware([accountMiddleware])
  .handler(async ({ context }) => {
    await markNotificationsSeen(database, { userId: context.userId, tenantId: context.tenantId });
    return { ok: true };
  });

export const clearNotificationsFn = createServerFn({ method: "POST" })
  .middleware([accountMiddleware])
  .handler(async ({ context }) => {
    await clearNotifications(database, { userId: context.userId, tenantId: context.tenantId });
    return { ok: true };
  });
