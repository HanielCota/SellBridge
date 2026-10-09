import { describe, expect, it, vi } from "vitest";
import { backoffDelay, createRateLimiter, fetchWithRetry, retryAfterMs } from "./http.ts";

function respond(status: number, headers: Record<string, string> = {}) {
  return new Response("{}", { status, headers });
}

const noSleep = { sleep: vi.fn<(ms: number) => Promise<void>>(async () => {}), random: () => 1 };

describe("fetchWithRetry", () => {
  it("returns immediately on success", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => respond(200));
    const response = await fetchWithRetry(fetchImpl, "https://x", {}, noSleep);
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry client errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => respond(400));
    const response = await fetchWithRetry(fetchImpl, "https://x", {}, noSleep);
    expect(response.status).toBe(400);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries 503 and succeeds", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(503))
      .mockResolvedValueOnce(respond(200));
    const response = await fetchWithRetry(fetchImpl, "https://x", {}, noSleep);
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("honors Retry-After on 429", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(429, { "retry-after": "2" }))
      .mockResolvedValueOnce(respond(200));
    await fetchWithRetry(fetchImpl, "https://x", {}, { sleep });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("returns the last retryable response when attempts run out", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => respond(500));
    const response = await fetchWithRetry(fetchImpl, "https://x", {}, { ...noSleep, retries: 2 });
    expect(response.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("throws a retryable MarketplaceError after repeated network errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      fetchWithRetry(fetchImpl, "https://x", {}, { ...noSleep, retries: 1 }),
    ).rejects.toMatchObject({ details: { retryable: true } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("backoff helpers", () => {
  it("grows exponentially and caps at maxDelayMs", () => {
    const options = { retries: 5, baseDelayMs: 100, maxDelayMs: 1000, random: () => 1 };
    expect(backoffDelay(0, options)).toBe(100);
    expect(backoffDelay(2, options)).toBe(400);
    expect(backoffDelay(10, options)).toBe(1000);
  });

  it("parses Retry-After as seconds or date and ignores garbage", () => {
    expect(retryAfterMs(respond(429, { "retry-after": "3" }))).toBe(3000);
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(
      retryAfterMs(respond(429, { "retry-after": "Thu, 01 Jan 2026 00:00:05 GMT" }), now),
    ).toBe(5000);
    expect(retryAfterMs(respond(429, { "retry-after": "soon" }))).toBeNull();
    expect(retryAfterMs(respond(429))).toBeNull();
  });
});

describe("createRateLimiter", () => {
  it("waits when the bucket is empty, per key", async () => {
    let clock = 0;
    const sleep = vi.fn<(ms: number) => Promise<void>>(async (ms) => {
      clock += ms;
    });
    const limiter = createRateLimiter({
      tokensPerInterval: 2,
      intervalMs: 1000,
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
