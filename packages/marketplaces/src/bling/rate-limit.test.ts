import { describe, expect, it } from "vitest";
import { createBlingRateLimiter, type BlingSlotStore } from "./rate-limit.ts";

function recordingSleep() {
  const waits: number[] = [];
  return {
    waits,
    sleep: async (milliseconds: number) => {
      waits.push(milliseconds);
    },
  };
}

describe("createBlingRateLimiter with shared slots", () => {
  it("waits for the slot the shared store hands out, so every process shares one quota", async () => {
    const reservations: { accountKey: string; spacingInMs: number }[] = [];
    const sharedSlots: BlingSlotStore = {
      reserve: async (accountKey, spacingInMs) => {
        reservations.push({ accountKey, spacingInMs });
        return 250;
      },
    };
    const { waits, sleep } = recordingSleep();
    const limiter = createBlingRateLimiter({ sharedSlots, sleep, now: () => 0 });

    await limiter.acquire("supplier-1");

    expect(reservations).toHaveLength(1);
    expect(reservations[0]?.accountKey).toBe("supplier-1");
    expect(Math.round(reservations[0]?.spacingInMs ?? 0)).toBe(333);
    expect(waits).toEqual([250]);
  });

  it("does not sleep when the shared slot is already free", async () => {
    const { waits, sleep } = recordingSleep();
    const limiter = createBlingRateLimiter({
      sharedSlots: { reserve: async () => 0 },
      sleep,
      now: () => 0,
    });

    await limiter.acquire("supplier-1");

    expect(waits).toEqual([]);
  });

  it("spaces this process's calls on its own while the shared store fails", async () => {
    const { waits, sleep } = recordingSleep();
    const limiter = createBlingRateLimiter({
      sharedSlots: {
        reserve: async () => {
          throw new Error("redis down");
        },
      },
      sleep,
      now: () => 0,
    });

    await limiter.acquire("supplier-1");
    await limiter.acquire("supplier-1");

    expect(waits.map(Math.round)).toEqual([333]);
  });
});
