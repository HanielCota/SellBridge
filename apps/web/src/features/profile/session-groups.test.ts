import { describe, expect, it } from "vitest";
import type { ActiveSession } from "./account.queries";
import { groupSessions } from "./session-groups";

const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function session(token: string, overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    token,
    ipAddress: "10.0.0.1",
    userAgent: WINDOWS_CHROME,
    createdAt: new Date("2026-10-01T10:00:00Z"),
    updatedAt: new Date("2026-10-09T10:00:00Z"),
    isCurrent: false,
    ...overrides,
  };
}

describe("groupSessions", () => {
  it("merges sessions with the same browser, system and IP, keeping the newest activity", () => {
    const groups = groupSessions([
      session("a", { updatedAt: new Date("2026-10-09T12:00:00Z") }),
      session("b", { updatedAt: new Date("2026-10-08T12:00:00Z") }),
      session("c", { userAgent: IPHONE_SAFARI }),
      session("d", { ipAddress: "10.0.0.2" }),
    ]);
    expect(groups.map((group) => group.tokens)).toEqual([["a", "b"], ["c"], ["d"]]);
    expect(groups[0]?.lastActiveAt).toEqual(new Date("2026-10-09T12:00:00Z"));
    expect(groups[1]?.device).toMatchObject({ browser: "Safari", os: "iOS" });
  });

  it("keeps the current session apart even when another one looks identical", () => {
    const groups = groupSessions([session("me", { isCurrent: true }), session("other")]);
    expect(groups.map((group) => [group.isCurrent, group.tokens])).toEqual([
      [true, ["me"]],
      [false, ["other"]],
    ]);
  });
});
