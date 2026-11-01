import { describe, expect, it } from "vitest";
import { badgeCount } from "./badge-count";

describe("badgeCount", () => {
  it("shows the count up to nine", () => {
    expect(badgeCount(1)).toBe("1");
    expect(badgeCount(9)).toBe("9");
  });

  it("shows 9+ above nine", () => {
    expect(badgeCount(10)).toBe("9+");
    expect(badgeCount(32)).toBe("9+");
  });
});
