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
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const buckets = new Map<string, TokenBucket>();
  const refillPerMilliseconds = options.tokensPerInterval / options.intervalMilliseconds;

  function refill(key: string): TokenBucket {
    const current = now();
    const bucket = buckets.get(key) ?? { tokens: options.tokensPerInterval, updatedAt: current };
    const elapsed = current - bucket.updatedAt;
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
