import type { NotificationEvent } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import { buildNotificationFeed, MAX_NOTIFICATIONS } from "./notification-feed";

function supportReply(minutesAgo: number, entityId = `ticket-${minutesAgo}`): NotificationEvent {
  return {
    kind: "support_reply",
    entityId,
    subject: "Dúvida",
    at: new Date(Date.UTC(2026, 9, 9, 12) - minutesAgo * 60_000),
  };
}

describe("buildNotificationFeed", () => {
  it("orders events of every kind newest first", () => {
    const feed = buildNotificationFeed([supportReply(30), supportReply(5), supportReply(10)], null);
    expect(feed.events.map((event) => event.entityId)).toEqual([
      "ticket-5",
      "ticket-10",
      "ticket-30",
    ]);
  });

  it("keeps only the newest events", () => {
    const events = Array.from({ length: MAX_NOTIFICATIONS + 5 }, (_, index) => supportReply(index));
    const feed = buildNotificationFeed(events, null);
    expect(feed.events).toHaveLength(MAX_NOTIFICATIONS);
    expect(feed.events.at(-1)?.entityId).toBe(`ticket-${MAX_NOTIFICATIONS - 1}`);
  });

  it("counts everything as unread until the user opens the feed", () => {
    const events = [supportReply(30), supportReply(5)];
    expect(buildNotificationFeed(events, null).unread).toBe(2);
    const seenAt = new Date(Date.UTC(2026, 9, 9, 12) - 10 * 60_000);
    expect(buildNotificationFeed(events, seenAt)).toMatchObject({ unread: 1, seenAt });
  });
});
