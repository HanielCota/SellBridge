import { describe, expect, it } from "vitest";
import type { AppNotification, NotificationKind } from "./notification-presenter";
import { belongsToTab } from "./notification-tabs";

function notificationOf(kind: NotificationKind): AppNotification {
  return { id: kind, kind, title: "", detail: "", at: new Date(), href: "/" };
}

describe("belongsToTab", () => {
  it("groups each kind under the tab of what the reseller has to do", () => {
    expect(belongsToTab(notificationOf("sale"), "sales")).toBe(true);
    expect(belongsToTab(notificationOf("listing_error"), "problems")).toBe(true);
    expect(belongsToTab(notificationOf("store_problem"), "problems")).toBe(true);
    expect(belongsToTab(notificationOf("support_reply"), "messages")).toBe(true);
    expect(belongsToTab(notificationOf("review_pending"), "messages")).toBe(true);
    expect(belongsToTab(notificationOf("sale"), "problems")).toBe(false);
  });

  it("shows every kind under all", () => {
    expect(belongsToTab(notificationOf("store_problem"), "all")).toBe(true);
  });
});
