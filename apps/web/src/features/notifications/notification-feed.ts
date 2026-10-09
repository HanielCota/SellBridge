import type { NotificationEvent } from "@sellbridge/database/repositories";

export const MAX_NOTIFICATIONS = 20;

export interface NotificationFeed<TEvent extends NotificationEvent = NotificationEvent> {
  /** Newest first, at most `MAX_NOTIFICATIONS`. */
  events: TEvent[];
  /** Events in the feed that happened after the user last opened it. */
  unread: number;
  seenAt: Date | null;
}

/** Merges the events of every kind into one feed, newest first, and counts what is unread. */
export function buildNotificationFeed<TEvent extends NotificationEvent>(
  events: readonly TEvent[],
  seenAt: Date | null,
): NotificationFeed<TEvent> {
  const newest = events
    .toSorted((first, second) => second.at.getTime() - first.at.getTime())
    .slice(0, MAX_NOTIFICATIONS);
  const unread = newest.filter((event) => seenAt === null || event.at > seenAt).length;
  return { events: newest, unread, seenAt };
}
