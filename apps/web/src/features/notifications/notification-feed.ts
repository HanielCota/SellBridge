import {
  type NotificationEvent,
  STANDING_NOTIFICATION_KINDS,
} from "@sellbridge/database/repositories";

export const MAX_NOTIFICATIONS = 20;

/**
 * Places the newest sales, replies and messages always get, even when open problems alone fill
 * the bell: a seller with 20 open shortages otherwise saw no new sale or supplier message at all.
 */
export const NEWS_SLOTS = 5;

/**
 * Listed on the bell but left out of its count: the Suporte button already shows the same reply.
 * One answer lit three numbers (button, bell and chat bubble) for a low-tech customer.
 */
const COUNTED_ELSEWHERE: ReadonlySet<NotificationEvent["kind"]> = new Set(["support_reply"]);

export interface NotificationFeed<TEvent extends NotificationEvent = NotificationEvent> {
  /**
   * Newest first, at most `MAX_NOTIFICATIONS`. More only when open problems leave fewer than
   * `NEWS_SLOTS` places: then every open problem plus the `NEWS_SLOTS` newest other events.
   */
  events: TEvent[];
  /** Events in the feed that happened after the user last opened it, minus support replies. */
  unread: number;
  seenAt: Date | null;
}

/**
 * Merges the events of every kind into one feed, newest first, and counts what is unread. Open
 * problems (a shortage, a cancelled parcel) are always kept, however old: the list is cut among
 * the rest, so newer sales and replies never push an unresolved problem out of sight, and the
 * newest `NEWS_SLOTS` of them stay however many problems are open.
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
    .slice(0, Math.max(MAX_NOTIFICATIONS - standing.length, NEWS_SLOTS));
  const newest = [...standing, ...others].toSorted(byNewest);
  const unread = newest.filter(
    (event) => !COUNTED_ELSEWHERE.has(event.kind) && (seenAt === null || event.at > seenAt),
  ).length;
  return { events: newest, unread, seenAt };
}
