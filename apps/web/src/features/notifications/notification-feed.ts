import {
  type NotificationEvent,
  STANDING_NOTIFICATION_KINDS,
} from "@sellbridge/database/repositories";

export const MAX_NOTIFICATIONS = 20;

/**
 * Listed on the bell but left out of its count: the Suporte button already shows the same reply.
 * One answer lit three numbers (button, bell and chat bubble) for a low-tech customer.
 */
const COUNTED_ELSEWHERE: ReadonlySet<NotificationEvent["kind"]> = new Set(["support_reply"]);

export interface NotificationFeed<TEvent extends NotificationEvent = NotificationEvent> {
  /** Newest first, at most `MAX_NOTIFICATIONS` (more only when open problems alone pass it). */
  events: TEvent[];
  /** Events in the feed that happened after the user last opened it, minus support replies. */
  unread: number;
  seenAt: Date | null;
}

/**
 * Merges the events of every kind into one feed, newest first, and counts what is unread. Open
 * problems (a shortage, a cancelled parcel) are always kept, however old: the list is cut among
 * the rest, so newer sales and replies never push an unresolved problem out of sight.
 */
export function buildNotificationFeed<TEvent extends NotificationEvent>(
  events: readonly TEvent[],
  seenAt: Date | null,
): NotificationFeed<TEvent> {
  const byNewest = (first: TEvent, second: TEvent) => second.at.getTime() - first.at.getTime();
  const standing = events.filter((event) => STANDING_NOTIFICATION_KINDS.has(event.kind));
  const others = events
    .filter((event) => !STANDING_NOTIFICATION_KINDS.has(event.kind))
    .toSorted(byNewest)
    .slice(0, Math.max(MAX_NOTIFICATIONS - standing.length, 0));
  const newest = [...standing, ...others].toSorted(byNewest);
  const unread = newest.filter(
    (event) => !COUNTED_ELSEWHERE.has(event.kind) && (seenAt === null || event.at > seenAt),
  ).length;
  return { events: newest, unread, seenAt };
}
