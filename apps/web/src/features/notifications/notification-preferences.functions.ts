import {
  listNotificationPreferences,
  saveNotificationPreference,
} from "@sellbridge/database/repositories";
import { NOTIFICATION_EVENTS } from "@sellbridge/shared/notification-events";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { buildPreferenceRows, PREFERENCE_CHANNELS } from "./notification-preferences";

const savePreferenceSchema = z.object({
  event: z.enum(NOTIFICATION_EVENTS),
  channel: z.enum(PREFERENCE_CHANNELS),
  enabled: z.boolean(),
});

/** The signed-in person's choices; preferences belong to the person, not the workspace. */
export const getNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) =>
    buildPreferenceRows(await listNotificationPreferences(database, context.userId)),
  );

export const saveNotificationPreferenceFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(savePreferenceSchema)
  .handler(async ({ context, data }) => {
    await saveNotificationPreference(database, { ...data, userId: context.userId });
    return { ok: true };
  });
