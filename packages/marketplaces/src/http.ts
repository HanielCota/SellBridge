import { logger } from "@sellbridge/shared/logger";
import { marketplaceError } from "./errors.ts";
import { defaultSleep } from "@sellbridge/shared/sleep";
import { readBodyWithin } from "@sellbridge/shared/http-body";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RetryOptions {
  retries: number;
  baseDelayMilliseconds: number;
  maxDelayMilliseconds: number;
  /** Each attempt is aborted after this long, so a hung connection cannot stall a job. */
  timeoutMilliseconds: number;
  /**
   * Largest body read into memory. The timeout bounds time, not bytes: a fast faulty reply could
   * still fill the worker's memory within it. JSON answers are far smaller; a label passes more.
   */
  maxBodyBytes: number;
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
  maxBodyBytes: 2 * 1024 * 1024,
};

/** More attempts than this would hold a job for minutes on an outage; refuse the setting. */
const MAX_RETRIES = 10;

/**
 * Fills each option the caller left out, one by one, and refuses a retry count that would hold
 * a job for minutes (or, as NaN, never end the loop: `attempt >= NaN` is always false).
 */
export function resolveRetryOptions(partial: Partial<RetryOptions>): RetryOptions {
  const options: RetryOptions = {
    ...partial,
    retries: partial.retries ?? DEFAULT_RETRY.retries,
    baseDelayMilliseconds: partial.baseDelayMilliseconds ?? DEFAULT_RETRY.baseDelayMilliseconds,
    maxDelayMilliseconds: partial.maxDelayMilliseconds ?? DEFAULT_RETRY.maxDelayMilliseconds,
    timeoutMilliseconds: partial.timeoutMilliseconds ?? DEFAULT_RETRY.timeoutMilliseconds,
    maxBodyBytes: partial.maxBodyBytes ?? DEFAULT_RETRY.maxBodyBytes,
  };
  if (!Number.isInteger(options.retries) || options.retries < 0 || options.retries > MAX_RETRIES) {
    throw new RangeError(
      `retries must be an integer from 0 to ${MAX_RETRIES}, got ${options.retries}`,
    );
  }
  return options;
}

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
  readonly maxBodyBytes: number;
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

class BodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Resposta do marketplace maior que ${maxBytes} bytes`);
    this.name = "BodyTooLargeError";
  }
}

/**
 * The body is read inside the attempt, under the same timeout: headers that arrive just before
 * the deadline followed by a stalled body are a timeout like any other, not a malformed reply.
 * The caller gets a buffered copy it can read with no deadline attached.
 */
async function fetchBuffered(attempt: FetchAttempt): Promise<Response> {
  const response = await attempt.fetchImplementation(attempt.url, {
    ...attempt.init,
    signal: attemptSignal(attempt),
  });
  const body = await readBodyWithin(response, attempt.maxBodyBytes);
  if (body === null) {
    throw new BodyTooLargeError(attempt.maxBodyBytes);
  }
  return new Response(body.byteLength > 0 ? body : null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * One network attempt: a network error or timeout returns null (retry) until the last attempt,
 * then throws. An abort from the caller's own signal throws at once, without further attempts.
 */
async function attemptFetch(attempt: FetchAttempt): Promise<Response | null> {
  try {
    return await fetchBuffered(attempt);
  } catch (error) {
    // Asking again returns the same oversized reply: a final answer, not a network blip.
    if (error instanceof BodyTooLargeError) {
      throw marketplaceError(error.message, { retryable: false, cause: error });
    }
    if (attempt.init.signal?.aborted) {
      throw marketplaceError("Requisição ao marketplace cancelada", {
        retryable: false,
        cause: error,
      });
    }
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
 * fetch with a per-attempt timeout (covering the body too) and retries for network errors,
 * timeouts and retryable statuses (429, 5xx...); non-idempotent methods retry only on 429.
 * Non-retryable responses are returned, with the body already buffered, for the caller to
 * interpret.
 */
export async function fetchWithRetry(
  fetchImplementation: FetchLike,
  url: string,
  init: RequestInit = {},
  partialOptions: Partial<RetryOptions> = {},
): Promise<Response> {
  const options = resolveRetryOptions(partialOptions);
  const sleep = options.sleep ?? defaultSleep;
  const isIdempotent = isIdempotentMethod(init.method);

  for (let attempt = 0; ; attempt += 1) {
    const isLastAttempt = attempt >= options.retries;
    const response = await attemptFetch({
      fetchImplementation,
      url,
      init,
      timeoutMilliseconds: options.timeoutMilliseconds,
      maxBodyBytes: options.maxBodyBytes,
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
