import { createHmac } from "node:crypto";
import { logger } from "@sellbridge/shared/logger";
import type {
  RateLimitDecision,
  RateLimitRule,
  RateLimitStore,
} from "@sellbridge/shared/redis-rate-limit-store";

const FIFTEEN_MINUTES_IN_SECONDS = 15 * 60;
const ONE_HOUR_IN_SECONDS = 60 * 60;

/**
 * Per address and path, on top of Better Auth's defaults. A window of minutes, not seconds, is
 * what slows password guessing down; the paths are Better Auth's, relative to `/api/auth`.
 */
export const AUTH_RATE_LIMIT_RULES: Readonly<Record<string, RateLimitRule>> = {
  "/sign-in/email": { window: FIFTEEN_MINUTES_IN_SECONDS, max: 10 },
  "/sign-in/social": { window: FIFTEEN_MINUTES_IN_SECONDS, max: 10 },
  "/sign-up/email": { window: ONE_HOUR_IN_SECONDS, max: 5 },
  "/request-password-reset": { window: FIFTEEN_MINUTES_IN_SECONDS, max: 3 },
  // A stolen session must not be able to guess the password through account deletion.
  "/delete-user": { window: 60, max: 5 },
};

/** Fallback entries kept while Redis is down; the oldest go first past this. */
const MAX_FALLBACK_ENTRIES = 10_000;
const MILLISECONDS_PER_SECOND = 1_000;

interface FallbackEntry {
  readonly count: number;
  readonly expiresAt: number;
}

/**
 * The same fixed window in this process' memory, used only while Redis does not answer: the
 * sign-in keeps a limit instead of locking everyone out or letting every guess through.
 */
export function createMemoryRateLimitStore(now: () => number = Date.now): RateLimitStore {
  const entries = new Map<string, FallbackEntry>();

  function forgetExpired(at: number): void {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= at) {
        entries.delete(key);
      }
    }
    const overflow = entries.size - MAX_FALLBACK_ENTRIES;
    if (overflow <= 0) {
      return;
    }
    const oldest = [...entries.keys()].slice(0, overflow);
    for (const key of oldest) {
      entries.delete(key);
    }
  }

  return {
    async consume(key, rule) {
      const at = now();
      forgetExpired(at);
      const current = entries.get(key);
      const entry: FallbackEntry =
        current === undefined
          ? { count: 1, expiresAt: at + rule.window * MILLISECONDS_PER_SECOND }
          : { count: current.count + 1, expiresAt: current.expiresAt };
      entries.set(key, entry);
      if (entry.count <= rule.max) {
        return { allowed: true, retryAfter: null };
      }
      const leftInSeconds = Math.ceil((entry.expiresAt - at) / MILLISECONDS_PER_SECOND);
      return { allowed: false, retryAfter: Math.max(1, leftInSeconds) };
    },
  };
}

interface AuthRateLimitStorageInput {
  /** Counters that survive a restart (Redis). */
  readonly shared: RateLimitStore;
  /** Counters for while `shared` fails. */
  readonly fallback: RateLimitStore;
  /** Keys are hashed with it, so Redis never holds a visitor's address in clear. */
  readonly keySecret: string;
}

function hashKey(key: string, secret: string): string {
  return createHmac("sha256", secret).update(key).digest("hex");
}

/**
 * Better Auth's `rateLimit.customStorage`: the counts live in Redis, so a deploy no longer resets
 * the protection against password guessing. Its key carries the visitor's address, so it is
 * hashed before storage and never logged.
 */
export function createAuthRateLimitStorage(input: AuthRateLimitStorageInput) {
  return {
    async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
      const hashedKey = hashKey(key, input.keySecret);
      try {
        return await input.shared.consume(hashedKey, rule);
      } catch (error) {
        logger.warn("auth.rate_limit_counting_in_memory", { error });
        return input.fallback.consume(hashedKey, rule);
      }
    },
  };
}
