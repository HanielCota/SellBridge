import type { RateLimitStore } from "@sellbridge/shared/redis-rate-limit-store";
import { describe, expect, it } from "vitest";
import {
  AUTH_RATE_LIMIT_RULES,
  createAuthRateLimitStorage,
  createMemoryRateLimitStore,
} from "./auth-rate-limit.ts";

const RULE = { window: 60, max: 2 };
const VISITOR_KEY = "203.0.113.7|/sign-in/email";

function recordingStore(): RateLimitStore & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    async consume(key) {
      keys.push(key);
      return { allowed: true, retryAfter: null };
    },
  };
}

const unavailableStore: RateLimitStore = {
  async consume() {
    throw new Error("Contagem de tentativas no Redis excedeu o prazo de 1000 ms");
  },
};

describe("AUTH_RATE_LIMIT_RULES", () => {
  it("limits sign-in, sign-up and the reset link over minutes, not seconds", () => {
    expect(AUTH_RATE_LIMIT_RULES["/sign-in/email"]).toEqual({ window: 900, max: 10 });
    expect(AUTH_RATE_LIMIT_RULES["/sign-up/email"]).toEqual({ window: 3600, max: 5 });
    expect(AUTH_RATE_LIMIT_RULES["/request-password-reset"]).toEqual({ window: 900, max: 3 });
  });
});

describe("createAuthRateLimitStorage", () => {
  it("never hands the visitor's address to Redis in clear", async () => {
    const shared = recordingStore();
    const storage = createAuthRateLimitStorage({
      shared,
      fallback: createMemoryRateLimitStore(),
      keySecret: "test-secret",
    });

    await storage.consume(VISITOR_KEY, RULE);
    await storage.consume(VISITOR_KEY, RULE);

    expect(shared.keys[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(shared.keys[0]).not.toContain("203.0.113.7");
    expect(shared.keys[1]).toBe(shared.keys[0]);
  });

  it("keeps limiting in memory while Redis does not answer", async () => {
    const storage = createAuthRateLimitStorage({
      shared: unavailableStore,
      fallback: createMemoryRateLimitStore(() => 0),
      keySecret: "test-secret",
    });

    const first = await storage.consume(VISITOR_KEY, RULE);
    const second = await storage.consume(VISITOR_KEY, RULE);
    const third = await storage.consume(VISITOR_KEY, RULE);

    expect([first.allowed, second.allowed, third.allowed]).toEqual([true, true, false]);
  });
});

describe("createMemoryRateLimitStore", () => {
  it("refuses past the max and says how long is left in the window", async () => {
    let now = 0;
    const store = createMemoryRateLimitStore(() => now);
    await store.consume("key", RULE);
    await store.consume("key", RULE);
    now = 20_000;

    const refused = await store.consume("key", RULE);

    expect(refused).toEqual({ allowed: false, retryAfter: 40 });
  });

  it("allows again once the window is over", async () => {
    let now = 0;
    const store = createMemoryRateLimitStore(() => now);
    await store.consume("key", RULE);
    await store.consume("key", RULE);
    await store.consume("key", RULE);
    now = 60_000;

    const afterWindow = await store.consume("key", RULE);

    expect(afterWindow).toEqual({ allowed: true, retryAfter: null });
  });

  it("counts each key apart", async () => {
    const store = createMemoryRateLimitStore(() => 0);
    await store.consume("one", RULE);
    await store.consume("one", RULE);

    const other = await store.consume("two", RULE);

    expect(other.allowed).toBe(true);
  });
});
