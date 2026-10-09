import { marketplaceError } from "./errors.ts";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Injected for tests; defaults to setTimeout. */
  sleep?: (milliseconds: number) => Promise<void>;
  /** Injected for tests; defaults to Math.random. */
  random?: () => number;
}

const DEFAULT_RETRY: RetryOptions = { retries: 3, baseDelayMs: 500, maxDelayMs: 10_000 };

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Exponential backoff with full jitter, capped at maxDelayMs. */
export function backoffDelay(attempt: number, options: RetryOptions): number {
  const random = options.random ?? Math.random;
  const exponential = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** attempt);
  return Math.round(random() * exponential);
}

/** Reads Retry-After (seconds or HTTP date) and returns milliseconds, or null. */
export function retryAfterMs(response: Response, now: number = Date.now()): number | null {
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
    const response = await fetchImplementation(url, init).catch((error: unknown) => {
      if (isLastAttempt) {
        throw marketplaceError("Falha de rede ao falar com o marketplace", {
          retryable: true,
          cause: error,
        });
      }
      return null;
    });
    if (response && !RETRYABLE_STATUS.has(response.status)) {
      return response;
    }
    if (response && isLastAttempt) {
      return response;
    }
    const waitMs = (response ? retryAfterMs(response) : null) ?? backoffDelay(attempt, options);
    await sleep(Math.min(waitMs, options.maxDelayMs));
  }
}

/**
 * Token bucket limiter keyed by store/app, so bursts respect marketplace quotas.
 * In-process only: each worker instance enforces its own share of the quota.
 */
export function createRateLimiter(options: {
  tokensPerInterval: number;
  intervalMs: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}) {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const buckets = new Map<string, { tokens: number; updatedAt: number }>();
  const refillPerMs = options.tokensPerInterval / options.intervalMs;

  function refill(key: string) {
    const current = now();
    const bucket = buckets.get(key) ?? { tokens: options.tokensPerInterval, updatedAt: current };
    const elapsed = current - bucket.updatedAt;
    const tokens = Math.min(options.tokensPerInterval, bucket.tokens + elapsed * refillPerMs);
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
    const waitMs = Math.ceil((1 - bucket.tokens) / refillPerMs);
    await sleep(waitMs);
    await acquire(key);
  }

  return { acquire };
}
