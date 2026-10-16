import type { NotificationChannelName } from "@sellbridge/shared/notification-content";
import {
  isNotificationEvent,
  type NotificationEventName,
} from "@sellbridge/shared/notification-events";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { notificationPreferences } from "../schema/index.ts";

export interface SavedNotificationPreference {
  event: NotificationEventName;
  channel: NotificationChannelName;
  enabled: boolean;
}

/** The person's own choices; events no longer in the catalog are left out. */
export async function listNotificationPreferences(
  database: Database,
  userId: string,
): Promise<SavedNotificationPreference[]> {
  const rows = await database
    .select({
      event: notificationPreferences.event,
      channel: notificationPreferences.channel,
      enabled: notificationPreferences.enabled,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  return rows.flatMap((row) =>
    isNotificationEvent(row.event) ? [{ ...row, event: row.event }] : [],
  );
}

export async function saveNotificationPreference(
  database: Database,
  preference: SavedNotificationPreference & { userId: string },
): Promise<void> {
  await database
    .insert(notificationPreferences)
    .values(preference)
    .onConflictDoUpdate({
      target: [
        notificationPreferences.userId,
        notificationPreferences.event,
        notificationPreferences.channel,
      ],
      set: { enabled: preference.enabled },
    });
}
