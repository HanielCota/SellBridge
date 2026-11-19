import { logger } from "@sellbridge/shared/logger";
import { defaultSleep } from "@sellbridge/shared/sleep";

/** Bling's quota: 3 requests per second for the whole account, every endpoint together. */
export const BLING_REQUESTS_PER_SECOND = 3;

const MAX_TRACKED_ACCOUNTS = 1_000;

/** A shared store that warns at most this often while it is down, so a sweep does not flood logs. */
const SHARED_FAILURE_LOG_INTERVAL_IN_MS = 60_000;

/**
 * Where each account's next free slot is kept. The shared one (Redis) is seen by every web and
 * worker process, so together they stay within the account's quota.
 */
export interface BlingSlotStore {
  /** Reserves the account's next slot and returns how long to wait for it, in milliseconds. */
  readonly reserve: (accountKey: string, spacingInMs: number) => Promise<number>;
}

function createLocalSlotStore(now: () => number): BlingSlotStore {
  const nextSlotByAccount = new Map<string, number>();
  return {
    async reserve(accountKey, spacingInMs) {
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
    },
  };
}

/**
 * Spaces each account's requests evenly (one every 1000/3 ms). With `sharedSlots`, the slots live
 * in Redis and every process shares them; while Redis fails, this process spaces its own calls
 * and a 429 can still come back (the client then waits for Retry-After).
 */
export function createBlingRateLimiter(
  options: {
    requestsPerSecond?: number;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
    sharedSlots?: BlingSlotStore;
  } = {},
) {
  const requestsPerSecond = options.requestsPerSecond ?? BLING_REQUESTS_PER_SECOND;
  if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0) {
    throw new RangeError(`requestsPerSecond must be positive, got ${requestsPerSecond}`);
  }
  const spacingInMs = 1000 / requestsPerSecond;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const localSlots = createLocalSlotStore(now);
  const sharedSlots = options.sharedSlots;
  let lastSharedFailureLogAt = Number.NEGATIVE_INFINITY;

  async function reserve(accountKey: string): Promise<number> {
    if (sharedSlots === undefined) {
      return localSlots.reserve(accountKey, spacingInMs);
    }
    try {
      return await sharedSlots.reserve(accountKey, spacingInMs);
    } catch (error) {
      if (now() - lastSharedFailureLogAt >= SHARED_FAILURE_LOG_INTERVAL_IN_MS) {
        lastSharedFailureLogAt = now();
        logger.warn("bling.shared_rate_limit_unavailable", { error });
      }
      return localSlots.reserve(accountKey, spacingInMs);
    }
  }

  return {
    async acquire(accountKey: string): Promise<void> {
      const waitInMs = await reserve(accountKey);
      if (waitInMs > 0) {
        await sleep(waitInMs);
      }
    },
  };
}

export type BlingRateLimiter = ReturnType<typeof createBlingRateLimiter>;
