import { describe, expect, it } from "vitest";
import {
  nextWebhookAttemptAt,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_DELAYS_MILLISECONDS,
} from "./webhook-retry.ts";

const now = new Date("2026-01-01T00:00:00Z");
const secondsLater = (attemptsMade: number) => {
  const next = nextWebhookAttemptAt(attemptsMade, now);
  return next === null ? null : (next.getTime() - now.getTime()) / 1000;
};

describe("webhook retry schedule", () => {
  it("backs off exponentially-ish between attempts", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(secondsLater)).toEqual([
      30, 120, 600, 1800, 3600, 10_800, 21_600,
    ]);
  });

  it("gives up after the last attempt", () => {
    expect(WEBHOOK_RETRY_DELAYS_MILLISECONDS).toHaveLength(WEBHOOK_MAX_ATTEMPTS - 1);
    expect(nextWebhookAttemptAt(WEBHOOK_MAX_ATTEMPTS, now)).toBeNull();
    expect(nextWebhookAttemptAt(WEBHOOK_MAX_ATTEMPTS + 3, now)).toBeNull();
  });
});
