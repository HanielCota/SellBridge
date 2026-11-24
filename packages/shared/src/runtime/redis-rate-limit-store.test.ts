import { describe, expect, it } from "vitest";
import { createRedisRateLimitStore } from "./redis-rate-limit-store.ts";

function queueRunning(runCommand: (name: string, args: string[]) => Promise<unknown>) {
  return { getBackend: () => ({ client: Promise.resolve({ runCommand }) }) };
}

const SIGN_IN_RULE = { window: 900, max: 10 };

describe("createRedisRateLimitStore", () => {
  it("counts with one atomic script on a namespaced key, window in milliseconds", async () => {
    const calls: { name: string; args: string[] }[] = [];
    const store = createRedisRateLimitStore(
      queueRunning(async (name, args) => {
        calls.push({ name, args });
        return [1, 900_000];
      }),
      "auth",
    );

    const decision = await store.consume("hashed-key", SIGN_IN_RULE);

    expect(decision).toEqual({ allowed: true, retryAfter: null });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("eval");
    expect(calls[0]?.args.slice(1)).toEqual([
      "1",
      "sellbridge:rate-limit:auth:hashed-key",
      "900000",
    ]);
  });

  it("allows the request that reaches the max exactly", async () => {
    const store = createRedisRateLimitStore(
      queueRunning(async () => [10, 400_000]),
      "auth",
    );

    const decision = await store.consume("hashed-key", SIGN_IN_RULE);

    expect(decision.allowed).toBe(true);
  });

  it("refuses past the max and says how many seconds are left, rounded up", async () => {
    const store = createRedisRateLimitStore(
      queueRunning(async () => [11, 400_001]),
      "auth",
    );

    const decision = await store.consume("hashed-key", SIGN_IN_RULE);

    expect(decision).toEqual({ allowed: false, retryAfter: 401 });
  });

  it("never asks to wait less than a second", async () => {
    const store = createRedisRateLimitStore(
      queueRunning(async () => [11, 0]),
      "auth",
    );

    const decision = await store.consume("hashed-key", SIGN_IN_RULE);

    expect(decision.retryAfter).toBe(1);
  });

  it("rejects an answer that is not a counter", async () => {
    const store = createRedisRateLimitStore(
      queueRunning(async () => "OK"),
      "auth",
    );

    await expect(store.consume("hashed-key", SIGN_IN_RULE)).rejects.toThrow(/answered OK/);
  });

  it("refuses a window that is not positive", async () => {
    const store = createRedisRateLimitStore(
      queueRunning(async () => [1, 1]),
      "auth",
    );

    await expect(store.consume("hashed-key", { window: 0, max: 3 })).rejects.toThrow(RangeError);
  });

  it("refuses a max that is not a whole number", async () => {
    const store = createRedisRateLimitStore(
      queueRunning(async () => [1, 1]),
      "auth",
    );

    await expect(store.consume("hashed-key", { window: 10, max: Number.NaN })).rejects.toThrow(
      RangeError,
    );
  });

  it("gives up after a second instead of waiting for Redis forever", async () => {
    const store = createRedisRateLimitStore(
      queueRunning(async () => new Promise(() => {})),
      "auth",
    );

    await expect(store.consume("hashed-key", SIGN_IN_RULE)).rejects.toThrow(/prazo/);
  });
});
