import { describe, expect, it, vi } from "vitest";
import { backoffDelay, fetchWithRetry, retryAfterMilliseconds } from "./http.ts";

function respond(status: number, headers: Record<string, string> = {}) {
  return new Response("{}", { status, headers });
}

/** Headers arrive at once; the body never does, and errors when the attempt is aborted. */
function stalledBody(signal: AbortSignal | null | undefined): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      signal?.addEventListener("abort", () => controller.error(signal.reason));
    },
  });
  return new Response(body, { status: 200 });
}

const noSleep = {
  sleep: vi.fn<(milliseconds: number) => Promise<void>>(async () => {}),
  random: () => 1,
};

describe("fetchWithRetry", () => {
  it("returns immediately on success", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => respond(200));
    const response = await fetchWithRetry(fetchImplementation, "https://x", {}, noSleep);
    expect(response.status).toBe(200);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("does not retry client errors", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => respond(400));
    const response = await fetchWithRetry(fetchImplementation, "https://x", {}, noSleep);
    expect(response.status).toBe(400);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("retries 503 and succeeds", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(503))
      .mockResolvedValueOnce(respond(200));
    const response = await fetchWithRetry(fetchImplementation, "https://x", {}, noSleep);
    expect(response.status).toBe(200);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("honors Retry-After on 429", async () => {
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>(async () => {});
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(429, { "retry-after": "2" }))
      .mockResolvedValueOnce(respond(200));
    await fetchWithRetry(fetchImplementation, "https://x", {}, { sleep });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("returns the last retryable response when attempts run out", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => respond(500));
    const response = await fetchWithRetry(
      fetchImplementation,
      "https://x",
      {},
      { ...noSleep, retries: 2 },
    );
    expect(response.status).toBe(500);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it("throws a retryable marketplace error after repeated network errors", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      fetchWithRetry(fetchImplementation, "https://x", {}, { ...noSleep, retries: 1 }),
    ).rejects.toMatchObject({ details: { retryable: true } });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("aborts an attempt that outlives the timeout", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    await expect(
      fetchWithRetry(
        fetchImplementation,
        "https://x",
        {},
        { ...noSleep, retries: 0, timeoutMilliseconds: 10 },
      ),
    ).rejects.toMatchObject({ details: { retryable: true } });
  });

  it("does not repeat a POST that got a 5xx", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => respond(503));
    const response = await fetchWithRetry(
      fetchImplementation,
      "https://x",
      { method: "POST" },
      noSleep,
    );
    expect(response.status).toBe(503);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("still retries a POST refused with 429", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(429))
      .mockResolvedValueOnce(respond(201));
    const response = await fetchWithRetry(
      fetchImplementation,
      "https://x",
      { method: "POST" },
      noSleep,
    );
    expect(response.status).toBe(201);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("reports a failed POST as not retryable, since it may have gone through", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      fetchWithRetry(fetchImplementation, "https://x", { method: "POST" }, noSleep),
    ).rejects.toMatchObject({ details: { retryable: false } });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("retries a GET whose body stalls past the timeout", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async (_input, init) => stalledBody(init?.signal))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const response = await fetchWithRetry(
      fetchImplementation,
      "https://x",
      {},
      { ...noSleep, timeoutMilliseconds: 10 },
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("reports a POST whose body stalls past the timeout as not retryable", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (_input, init) =>
      stalledBody(init?.signal),
    );
    await expect(
      fetchWithRetry(
        fetchImplementation,
        "https://x",
        { method: "POST" },
        { ...noSleep, timeoutMilliseconds: 10 },
      ),
    ).rejects.toMatchObject({ details: { retryable: false } });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("stops at once, without retrying, when the caller aborts", async () => {
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>(async () => {});
    const controller = new AbortController();
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    await expect(
      fetchWithRetry(
        fetchImplementation,
        "https://x",
        { signal: controller.signal },
        { sleep, random: () => 1 },
      ),
    ).rejects.toMatchObject({ details: { retryable: false } });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("backoff helpers", () => {
  it("grows exponentially and caps at maxDelayMilliseconds", () => {
    const options = {
      retries: 5,
      baseDelayMilliseconds: 100,
      maxDelayMilliseconds: 1000,
      timeoutMilliseconds: 1000,
      random: () => 1,
    };
    expect(backoffDelay(0, options)).toBe(100);
    expect(backoffDelay(2, options)).toBe(400);
    expect(backoffDelay(10, options)).toBe(1000);
  });

  it("parses Retry-After as seconds or date and ignores garbage", () => {
    expect(retryAfterMilliseconds(respond(429, { "retry-after": "3" }))).toBe(3000);
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(
      retryAfterMilliseconds(respond(429, { "retry-after": "Thu, 01 Jan 2026 00:00:05 GMT" }), now),
    ).toBe(5000);
    expect(retryAfterMilliseconds(respond(429, { "retry-after": "soon" }))).toBeNull();
    expect(retryAfterMilliseconds(respond(429))).toBeNull();
  });
});
