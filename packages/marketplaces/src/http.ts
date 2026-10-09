import { logger } from "@sellbridge/shared/logger";
import { marketplaceError } from "./errors.ts";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RetryOptions {
  retries: number;
  baseDelayMilliseconds: number;
  maxDelayMilliseconds: number;
  /** Injected for tests; defaults to setTimeout. */
  sleep?: (milliseconds: number) => Promise<void>;
  /** Injected for tests; defaults to Math.random. */
  random?: () => number;
}

const DEFAULT_RETRY: RetryOptions = {
  retries: 3,
  baseDelayMilliseconds: 500,
  maxDelayMilliseconds: 10_000,
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Exponential backoff with full jitter, capped at maxDelayMilliseconds. */
export function backoffDelay(attempt: number, options: RetryOptions): number {
  const random = options.random ?? Math.random;
  const exponential = Math.min(
    options.maxDelayMilliseconds,
    options.baseDelayMilliseconds * 2 ** attempt,
  );
  return Math.round(random() * exponential);
}

/** Reads Retry-After (seconds or HTTP date) and returns milliseconds, or null. */
export function retryAfterMilliseconds(
  response: Response,
  now: number = Date.now(),
): number | null {
  const header = response.headers.get("retry-after");
  if (!header) {
    return null;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const date = Date.parse(header);
  if (Number.isNaN(date)) {
    return null;
  }
  return Math.max(0, date - now);
}

interface FetchAttempt {
  readonly fetchImplementation: FetchLike;
  readonly url: string;
  readonly init: RequestInit;
  readonly isLastAttempt: boolean;
}

/** One network attempt: a network error returns null (retry) until the last attempt, then throws. */
async function attemptFetch(attempt: FetchAttempt): Promise<Response | null> {
  try {
    return await attempt.fetchImplementation(attempt.url, attempt.init);
  } catch (error) {
    if (attempt.isLastAttempt) {
      throw marketplaceError("Falha de rede ao falar com o marketplace", {
        retryable: true,
        cause: error,
      });
    }
    logger.warn("marketplace.network_retry", { host: new URL(attempt.url).host, error });
    return null;
  }
}

/**
 * fetch with retries for network errors and retryable statuses (429, 5xx...).
 * Non-retryable responses are returned to the caller to interpret.
 */
export async function fetchWithRetry(
  fetchImplementation: FetchLike,
  url: string,
  init: RequestInit = {},
  partialOptions: Partial<RetryOptions> = {},
): Promise<Response> {
  const options: RetryOptions = { ...DEFAULT_RETRY, ...partialOptions };
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt += 1) {
    const isLastAttempt = attempt >= options.retries;
    const response = await attemptFetch({ fetchImplementation, url, init, isLastAttempt });
    if (response && !RETRYABLE_STATUS.has(response.status)) {
      return response;
    }
    if (response && isLastAttempt) {
      return response;
    }
    const waitMilliseconds =
      (response ? retryAfterMilliseconds(response) : null) ?? backoffDelay(attempt, options);
    await sleep(Math.min(waitMilliseconds, options.maxDelayMilliseconds));
  }
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
  const buckets = new Map<string, { tokens: number; updatedAt: number }>();
  const refillPerMilliseconds = options.tokensPerInterval / options.intervalMilliseconds;

  function refill(key: string) {
    const current = now();
    const bucket = buckets.get(key) ?? { tokens: options.tokensPerInterval, updatedAt: current };
    const elapsed = current - bucket.updatedAt;
    const tokens = Math.min(
      options.tokensPerInterval,
      bucket.tokens + elapsed * refillPerMilliseconds,
    );
    const updated = { tokens, updatedAt: current };
    buckets.set(key, updated);
    return updated;
  }

  async function acquire(key: string): Promise<void> {
    const bucket = refill(key);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }
    const waitMilliseconds = Math.ceil((1 - bucket.tokens) / refillPerMilliseconds);
    await sleep(waitMilliseconds);
    await acquire(key);
  }

  return { acquire };
}
