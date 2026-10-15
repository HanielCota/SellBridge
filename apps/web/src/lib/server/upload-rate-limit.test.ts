import { describe, expect, it } from "vitest";
import { assertUploadAllowed, createUploadLimiter } from "./upload-rate-limit";

const NOW = new Date("2026-10-15T12:00:00Z");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

describe("createUploadLimiter", () => {
  it("lets each account send its budget in the window, then refuses", () => {
    const limiter = createUploadLimiter({ maxRequests: 3, windowMilliseconds: 10 * 60_000 });
    expect([1, 2, 3].map(() => limiter.take("user-1", NOW))).toEqual([true, true, true]);
    expect(limiter.take("user-1", later(1))).toBe(false);
    expect(limiter.take("user-2", later(1))).toBe(true);
  });

  it("gives the budget back as the oldest uploads leave the window", () => {
    const limiter = createUploadLimiter({ maxRequests: 2, windowMilliseconds: 10 * 60_000 });
    expect(limiter.take("user-1", NOW)).toBe(true);
    expect(limiter.take("user-1", later(5))).toBe(true);
    expect(limiter.take("user-1", later(9))).toBe(false);
    expect(limiter.take("user-1", later(11))).toBe(true);
  });
});

describe("assertUploadAllowed", () => {
  it("answers 429 once the budget is spent", () => {
    const limiter = createUploadLimiter({ maxRequests: 1, windowMilliseconds: 60_000 });
    expect(() => assertUploadAllowed(limiter, "user-1")).not.toThrow();
    expect(() => assertUploadAllowed(limiter, "user-1")).toThrow(
      expect.objectContaining({ code: "RATE_LIMITED" }),
    );
  });
});
