import { describe, expect, it } from "vitest";
import { isUnreadCountQuery } from "./use-mark-ticket-read";

describe("isUnreadCountQuery", () => {
  it("refreshes ticket lists, queues and counts after reading a thread", () => {
    expect(isUnreadCountQuery(["tickets", "mine", { page: 1 }])).toBe(true);
    expect(isUnreadCountQuery(["tickets", "mine", "overview"])).toBe(true);
    expect(isUnreadCountQuery(["tickets", "admin", "queues"])).toBe(true);
    expect(isUnreadCountQuery(["tickets", "admin", "open-count"])).toBe(true);
  });

  it("leaves the open thread alone, so reading it does not fetch it again", () => {
    expect(isUnreadCountQuery(["tickets", "mine", "detail", "ticket-1"])).toBe(false);
    expect(isUnreadCountQuery(["tickets", "admin", "detail", "ticket-1"])).toBe(false);
  });

  it("ignores queries outside support", () => {
    expect(isUnreadCountQuery(["notifications"])).toBe(false);
  });
});
