import type { NotificationEvent } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import { buildNotificationFeed, MAX_NOTIFICATIONS, NEWS_SLOTS } from "./notification-feed";

function supportReply(minutesAgo: number, entityId = `ticket-${minutesAgo}`): NotificationEvent {
  return {
    kind: "support_reply",
    entityId,
    subject: "Dúvida",
    at: new Date(Date.UTC(2026, 9, 9, 12) - minutesAgo * 60_000),
  };
}

function sale(minutesAgo: number): NotificationEvent {
  return {
    kind: "sale",
    entityId: `order-${minutesAgo}`,
    at: new Date(Date.UTC(2026, 9, 9, 12) - minutesAgo * 60_000),
    externalOrderId: `ORD-${minutesAgo}`,
    totalCents: 4990,
    storeName: "Loja",
    product: null,
  };
}

function openShortage(daysAgo: number): NotificationEvent {
  return {
    kind: "stock_shortage",
    entityId: `short-${daysAgo}`,
    externalOrderId: `MLB-${daysAgo}`,
    productTitle: "Vestido",
    at: new Date(Date.UTC(2026, 9, 4, 12) - daysAgo * 86_400_000),
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
    const events = [sale(30), sale(5)];
    expect(buildNotificationFeed(events, null).unread).toBe(2);
    const seenAt = new Date(Date.UTC(2026, 9, 9, 12) - 10 * 60_000);
    expect(buildNotificationFeed(events, seenAt)).toMatchObject({ unread: 1, seenAt });
  });

  it("lists a support reply without counting it on the bell, which the Suporte button counts", () => {
    const feed = buildNotificationFeed([supportReply(5), sale(10)], null);
    expect(feed.events.map((event) => event.kind)).toEqual(["support_reply", "sale"]);
    expect(feed.unread).toBe(1);
  });

  it("keeps an open problem however many newer events arrived after it", () => {
    const shortage: NotificationEvent = {
      kind: "stock_shortage",
      entityId: "order-short",
      externalOrderId: "MLB-1",
      productTitle: "Vestido",
      at: new Date(Date.UTC(2026, 9, 4, 12)),
    };
    const newer = Array.from({ length: MAX_NOTIFICATIONS + 5 }, (_, index) => supportReply(index));
    const feed = buildNotificationFeed([...newer, shortage], null);
    expect(feed.events).toHaveLength(MAX_NOTIFICATIONS);
    expect(feed.events.at(-1)?.entityId).toBe("order-short");
  });
  it("keeps room for the newest sales and replies when open problems alone fill the bell", () => {
    const problems = Array.from({ length: MAX_NOTIFICATIONS + 3 }, (_, index) =>
      openShortage(index),
    );
    const news = Array.from({ length: 8 }, (_, index) => sale(index));
    const feed = buildNotificationFeed([...problems, ...news], null);
    const kept = feed.events
      .filter((event) => event.kind === "sale")
      .map((event) => event.entityId);
    expect(kept).toEqual(["order-0", "order-1", "order-2", "order-3", "order-4"]);
    expect(feed.events.filter((event) => event.kind === "stock_shortage")).toHaveLength(
      problems.length,
    );
  });
  it("keeps the news slots when open problems almost fill the bell", () => {
    const problems = Array.from({ length: MAX_NOTIFICATIONS - 2 }, (_, index) =>
      openShortage(index),
    );
    const news = Array.from({ length: 8 }, (_, index) => sale(index));
    const feed = buildNotificationFeed([...problems, ...news], null);
    expect(feed.events.filter((event) => event.kind === "sale")).toHaveLength(NEWS_SLOTS);
    expect(feed.events).toHaveLength(problems.length + NEWS_SLOTS);
  });
});
