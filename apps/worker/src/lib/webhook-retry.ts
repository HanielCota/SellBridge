/** Attempts per delivery, the first included; afterwards the delivery is marked "failed". */
export const WEBHOOK_MAX_ATTEMPTS = 8;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Wait after the 1st, 2nd... failed attempt: about 11 hours from first try to giving up. */
export const WEBHOOK_RETRY_DELAYS_MILLISECONDS: readonly number[] = [
  30 * 1000,
  2 * MINUTE,
  10 * MINUTE,
  30 * MINUTE,
  HOUR,
  3 * HOUR,
  6 * HOUR,
];

/**
 * When to try again after `attemptsMade` attempts (the failed one included), or null when
 * attempts ran out.
 */
export function nextWebhookAttemptAt(attemptsMade: number, now: Date): Date | null {
  if (attemptsMade >= WEBHOOK_MAX_ATTEMPTS) {
    return null;
  }
  const delay = WEBHOOK_RETRY_DELAYS_MILLISECONDS[Math.max(attemptsMade, 1) - 1];
  if (delay === undefined) {
    return null;
  }
  return new Date(now.getTime() + delay);
}
