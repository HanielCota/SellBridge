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

describe("createRateLimiter bounds", () => {
  it.each([0, 0.5, -1, Number.NaN])("refuses %s tokens per interval", (tokensPerInterval) => {
    expect(() => createRateLimiter({ tokensPerInterval, intervalMilliseconds: 1000 })).toThrow(
      RangeError,
    );
  });

  it.each([0, -5])("refuses an interval of %s ms", (intervalMilliseconds) => {
    expect(() => createRateLimiter({ tokensPerInterval: 1, intervalMilliseconds })).toThrow(
      RangeError,
    );
  });

  it("does not drain the bucket when the clock goes back", async () => {
    let clock = 10_000;
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>(async (milliseconds) => {
      clock += milliseconds;
    });
    const limiter = createRateLimiter({
      tokensPerInterval: 1,
      intervalMilliseconds: 1000,
      now: () => clock,
      sleep,
    });
    await limiter.acquire("store-a");
    clock -= 5000;
    await limiter.acquire("store-a");
    expect(sleep).toHaveBeenCalledWith(1000);
  });
});
