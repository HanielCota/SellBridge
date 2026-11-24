import { withDeadline } from "./deadline.ts";
import type { RedisBackedQueue } from "./queues.ts";

/** How many requests a key may make within a window, as Better Auth describes a rule. */
export interface RateLimitRule {
  /** Window length in seconds. */
  readonly window: number;
  readonly max: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Seconds until the window frees up; null when the request was allowed. */
  readonly retryAfter: number | null;
}

export interface RateLimitStore {
  consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
}

/**
 * Counts one request in a fixed window, atomically: the first request of a window sets its
 * lifetime, later ones only add to it, so refused requests never stretch the wait.
 * KEYS[1] = counter key; ARGV[1] = window in ms; returns { count, ms left in the window }.
 */
const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local left = redis.call('PTTL', KEYS[1])
if left < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  left = tonumber(ARGV[1])
end
return { count, left }
`;

const KEY_PREFIX = "sellbridge:rate-limit:";

/** The queue connection retries forever while Redis is down; a sign-in must not wait that long. */
const CONSUME_DEADLINE_IN_MS = 1_000;

const MILLISECONDS_PER_SECOND = 1_000;

async function runConsume(queue: RedisBackedQueue, key: string, windowInMs: number) {
  const client = await queue.getBackend().client;
  return client.runCommand("eval", [CONSUME_SCRIPT, "1", key, String(windowInMs)]);
}

function assertValidRule(rule: RateLimitRule): void {
  if (!Number.isFinite(rule.window) || rule.window <= 0) {
    throw new RangeError(`Rate limit window must be positive seconds, got ${rule.window}`);
  }
  if (!Number.isInteger(rule.max) || rule.max < 0) {
    throw new RangeError(`Rate limit max must be a non-negative integer, got ${rule.max}`);
  }
}

function parseCounter(answer: unknown): { count: number; leftInMs: number } {
  if (!Array.isArray(answer) || answer.length !== 2) {
    throw new Error(`Redis rate limit answered ${String(answer)}`);
  }
  const count = Number(answer[0]);
  const leftInMs = Number(answer[1]);
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(leftInMs)) {
    throw new Error(`Redis rate limit answered ${String(answer)}`);
  }
  return { count, leftInMs };
}

/**
 * Request counters in Redis, through the queue connection the process already holds, so the
 * counts survive a restart of the web app (every deploy) and are shared by every instance.
 *
 * @param namespace - Keeps one limiter's counters apart from another's ("auth").
 * @throws {RangeError} When the rule's window is not positive or its max is not a whole number.
 * @throws {DeadlineExceededError} When Redis does not answer within a second.
 */
export function createRedisRateLimitStore(
  queue: RedisBackedQueue,
  namespace: string,
): RateLimitStore {
  return {
    async consume(key, rule) {
      assertValidRule(rule);
      const windowInMs = Math.ceil(rule.window * MILLISECONDS_PER_SECOND);
      const answer = await withDeadline(
        runConsume(queue, `${KEY_PREFIX}${namespace}:${key}`, windowInMs),
        CONSUME_DEADLINE_IN_MS,
        "Contagem de tentativas no Redis",
      );
      const { count, leftInMs } = parseCounter(answer);
      if (count <= rule.max) {
        return { allowed: true, retryAfter: null };
      }
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil(leftInMs / MILLISECONDS_PER_SECOND)),
      };
    },
  };
}
