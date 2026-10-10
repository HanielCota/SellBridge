import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rate-limiter.ts";

describe("createRateLimiter", () => {
  it("waits when the bucket is empty, per key", async () => {
    let clock = 0;
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>(async (milliseconds) => {
      clock += milliseconds;
    });
    const limiter = createRateLimiter({
      tokensPerInterval: 2,
      intervalMilliseconds: 1000,
      now: () => clock,
      sleep,
    });
    await limiter.acquire("store-a");
    await limiter.acquire("store-a");
    expect(sleep).not.toHaveBeenCalled();
    await limiter.acquire("store-a");
    expect(sleep).toHaveBeenCalledWith(500);
    await limiter.acquire("store-b");
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
