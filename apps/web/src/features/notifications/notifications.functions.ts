import { listNotifications, markNotificationsSeen } from "@sellbridge/database/repositories";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";

export const getNotifications = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) =>
    listNotifications(database, { tenantId: context.tenantId, userId: context.userId }),
  );

export const markNotificationsSeenFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => {
    await markNotificationsSeen(database, context.userId);
    return { ok: true };
  });
