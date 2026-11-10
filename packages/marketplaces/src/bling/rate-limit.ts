import { defaultSleep } from "@sellbridge/shared/sleep";

/** Bling's quota: 3 requests per second for the whole account, every endpoint together. */
export const BLING_REQUESTS_PER_SECOND = 3;

const MAX_TRACKED_ACCOUNTS = 1_000;

/**
 * Spaces each account's requests evenly (one every 1000/3 ms), in this process. Several web and
 * worker processes share the account's quota, so a 429 can still come back: the client then
 * waits for Retry-After.
 */
export function createBlingRateLimiter(
  options: {
    requestsPerSecond?: number;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {},
) {
  const requestsPerSecond = options.requestsPerSecond ?? BLING_REQUESTS_PER_SECOND;
  if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0) {
    throw new RangeError(`requestsPerSecond must be positive, got ${requestsPerSecond}`);
  }
  const spacingInMs = 1000 / requestsPerSecond;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const nextSlotByAccount = new Map<string, number>();

  function reserveSlot(accountKey: string): number {
    const current = now();
    const slot = Math.max(current, nextSlotByAccount.get(accountKey) ?? current);
    nextSlotByAccount.delete(accountKey);
    if (nextSlotByAccount.size >= MAX_TRACKED_ACCOUNTS) {
      const oldest = nextSlotByAccount.keys().next();
      if (oldest.done !== true) {
        nextSlotByAccount.delete(oldest.value);
      }
    }
    nextSlotByAccount.set(accountKey, slot + spacingInMs);
    return slot - current;
  }

  return {
    async acquire(accountKey: string): Promise<void> {
      const waitInMs = reserveSlot(accountKey);
      if (waitInMs > 0) {
        await sleep(waitInMs);
      }
    },
  };
}

export type BlingRateLimiter = ReturnType<typeof createBlingRateLimiter>;
