import type { SavedNotificationPreference } from "@sellbridge/database/repositories";
import {
  channelEnabled,
  NOTIFICATION_EVENT_DEFINITIONS,
  NOTIFICATION_EVENTS,
  type NotificationEventName,
} from "@sellbridge/shared/notification-events";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import type { NotificationKind } from "./notification-presenter";

/**
 * Channels shown on the preferences screen. Push is saved with its default but not offered
 * until a push provider exists: a switch that does nothing would mislead.
 */
export const PREFERENCE_CHANNELS = ["in_app", "email"] as const;
export type PreferenceChannel = (typeof PREFERENCE_CHANNELS)[number];

export const PREFERENCE_CHANNEL_LABELS: Record<PreferenceChannel, string> = {
  in_app: "No app",
  email: "E-mail",
};

export interface PreferenceCell {
  /** False when the event never goes out on this channel (deliveries have no bell entry). */
  available: boolean;
  enabled: boolean;
}

export interface PreferenceRow {
  event: NotificationEventName;
  label: string;
  description: string;
  channels: Record<PreferenceChannel, PreferenceCell>;
}

function savedChoice(
  saved: readonly SavedNotificationPreference[],
  event: NotificationEventName,
  channel: PreferenceChannel,
): boolean | undefined {
  return saved.find((row) => row.event === event && row.channel === channel)?.enabled;
}

function cellOf(
  saved: readonly SavedNotificationPreference[],
  event: NotificationEventName,
  channel: PreferenceChannel,
): PreferenceCell {
  return {
    available: NOTIFICATION_EVENT_DEFINITIONS[event].defaults[channel] !== undefined,
    enabled: channelEnabled(event, channel, savedChoice(saved, event, channel)),
  };
}

/**
 * What reaches a supplier profile today: their support tickets. Sales, store and listing notices
 * are the reseller's; a supplier saw switches for "Loja desconectada" that never applied to them.
 * New orders reach a supplier by e-mail on the brand's order address, outside these switches.
 */
const SUPPLIER_EVENTS: ReadonlySet<NotificationEventName> = new Set(["support_reply"]);

function shownTo(kind: ProfileKind, event: NotificationEventName): boolean {
  // Team notices (a new ticket) are not the customer's to choose; the team keeps the default.
  if (NOTIFICATION_EVENT_DEFINITIONS[event].audience !== "reseller") {
    return false;
  }
  return kind === "seller" || SUPPLIER_EVENTS.has(event);
}

/** Every event this kind of profile receives, with what each channel will do for this person. */
export function buildPreferenceRows(
  saved: readonly SavedNotificationPreference[],
  kind: ProfileKind,
): PreferenceRow[] {
  return NOTIFICATION_EVENTS.filter((event) => shownTo(kind, event)).map((event) => ({
    event,
    label: NOTIFICATION_EVENT_DEFINITIONS[event].label,
    description: NOTIFICATION_EVENT_DEFINITIONS[event].description,
    channels: {
      in_app: cellOf(saved, event, "in_app"),
      email: cellOf(saved, event, "email"),
    },
  }));
}

/** The bell entry each event stands for (deliveries have none). */
const BELL_KIND_OF_EVENT: Partial<Record<NotificationEventName, NotificationKind>> = {
  sale_paid: "sale",
  shipment_late: "shipment_late",
  store_expired: "store_problem",
  listing_failed: "listing_error",
  support_reply: "support_reply",
};

/** Bell entries the person turned off ("No app" switched off). */
export function hiddenNotificationKinds(
  saved: readonly SavedNotificationPreference[],
): ReadonlySet<NotificationKind> {
  return new Set(
    saved.flatMap((row) => {
      const kind = BELL_KIND_OF_EVENT[row.event];
      return row.channel === "in_app" && !row.enabled && kind !== undefined ? [kind] : [];
    }),
  );
}
