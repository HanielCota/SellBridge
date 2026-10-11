import { logger } from "@sellbridge/shared/logger";
import { marketplaceError } from "./errors.ts";
import { defaultSleep } from "@sellbridge/shared/sleep";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RetryOptions {
  retries: number;
  baseDelayMilliseconds: number;
  maxDelayMilliseconds: number;
  /** Each attempt is aborted after this long, so a hung connection cannot stall a job. */
  timeoutMilliseconds: number;
  /** Injected for tests; defaults to setTimeout. */
  sleep?: (milliseconds: number) => Promise<void>;
  /** Injected for tests; defaults to Math.random. */
  random?: () => number;
}

const DEFAULT_RETRY: RetryOptions = {
  retries: 3,
  baseDelayMilliseconds: 500,
  maxDelayMilliseconds: 10_000,
  timeoutMilliseconds: 15_000,
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * A POST/PATCH that timed out or got a 5xx may already have taken effect (an item created, a
 * single-use refresh token rotated), so repeating it can duplicate the effect. Those methods
 * are retried only on 429, which means the request was refused before being processed.
 */
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

function isRetryable(response: Response | null, isIdempotent: boolean): boolean {
  if (isIdempotent) {
    return response === null || RETRYABLE_STATUS.has(response.status);
  }
  return response?.status === 429;
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
  readonly timeoutMilliseconds: number;
  readonly isLastAttempt: boolean;
  /** False for a POST/PATCH: it may have gone through, so a job must not blindly repeat it. */
  readonly isIdempotent: boolean;
}

function attemptSignal(attempt: FetchAttempt): AbortSignal {
  const timeout = AbortSignal.timeout(attempt.timeoutMilliseconds);
  if (!attempt.init.signal) {
    return timeout;
  }
  return AbortSignal.any([timeout, attempt.init.signal]);
}

/** One network attempt: a network error returns null (retry) until the last attempt, then throws. */
async function attemptFetch(attempt: FetchAttempt): Promise<Response | null> {
  try {
    return await attempt.fetchImplementation(attempt.url, {
      ...attempt.init,
      signal: attemptSignal(attempt),
    });
  } catch (error) {
    if (attempt.isLastAttempt) {
      throw marketplaceError("Falha de rede ao falar com o marketplace", {
        retryable: attempt.isIdempotent,
        cause: error,
      });
    }
    logger.warn("marketplace.network_retry", { host: new URL(attempt.url).host, error });
    return null;
  }
}

export function isIdempotentMethod(method: string | undefined): boolean {
  return IDEMPOTENT_METHODS.has((method ?? "GET").toUpperCase());
}

/**
 * fetch with a per-attempt timeout and retries for network errors and retryable statuses
 * (429, 5xx...); non-idempotent methods retry only on 429. Non-retryable responses are
 * returned to the caller to interpret.
 */
export async function fetchWithRetry(
  fetchImplementation: FetchLike,
  url: string,
  init: RequestInit = {},
  partialOptions: Partial<RetryOptions> = {},
): Promise<Response> {
  const options: RetryOptions = { ...DEFAULT_RETRY, ...partialOptions };
  const sleep = options.sleep ?? defaultSleep;
  const isIdempotent = isIdempotentMethod(init.method);

  for (let attempt = 0; ; attempt += 1) {
    const isLastAttempt = attempt >= options.retries;
    const response = await attemptFetch({
      fetchImplementation,
      url,
      init,
      timeoutMilliseconds: options.timeoutMilliseconds,
      isLastAttempt: isLastAttempt || !isIdempotent,
      isIdempotent,
    });
    if (response && !isRetryable(response, isIdempotent)) {
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
