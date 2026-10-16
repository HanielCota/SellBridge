import { defaultSleep } from "@sellbridge/shared/sleep";

interface TokenBucket {
  readonly tokens: number;
  readonly updatedAt: number;
}

/**
 * Token bucket limiter keyed by store/app, so bursts respect marketplace quotas.
 * In-process only: each worker instance enforces its own share of the quota.
 */
export function createRateLimiter(options: {
  tokensPerInterval: number;
  intervalMilliseconds: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}) {
  // Below one token per interval the bucket never holds a whole token and `acquire` waits forever;
  // at zero the wait is Infinity, which setTimeout turns into a 1 ms busy loop.
  if (!Number.isFinite(options.tokensPerInterval) || options.tokensPerInterval < 1) {
    throw new RangeError(`tokensPerInterval must be at least 1, got ${options.tokensPerInterval}`);
  }
  if (!Number.isFinite(options.intervalMilliseconds) || options.intervalMilliseconds <= 0) {
    throw new RangeError(
      `intervalMilliseconds must be positive, got ${options.intervalMilliseconds}`,
    );
  }
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const buckets = new Map<string, TokenBucket>();
  const refillPerMilliseconds = options.tokensPerInterval / options.intervalMilliseconds;

  function refill(key: string): TokenBucket {
    const current = now();
    const bucket = buckets.get(key) ?? { tokens: options.tokensPerInterval, updatedAt: current };
    // A clock set back (NTP) must not drain the bucket below zero.
    const elapsed = Math.max(0, current - bucket.updatedAt);
    const tokens = Math.min(
      options.tokensPerInterval,
      bucket.tokens + elapsed * refillPerMilliseconds,
    );
    const updated: TokenBucket = { tokens, updatedAt: current };
    buckets.set(key, updated);
    return updated;
  }

  async function acquire(key: string): Promise<void> {
    const bucket = refill(key);
    if (bucket.tokens >= 1) {
      buckets.set(key, { ...bucket, tokens: bucket.tokens - 1 });
      return;
    }
    const waitMilliseconds = Math.ceil((1 - bucket.tokens) / refillPerMilliseconds);
    await sleep(waitMilliseconds);
    await acquire(key);
  }

  return { acquire };
}
