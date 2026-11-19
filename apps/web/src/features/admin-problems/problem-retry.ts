import {
  JOB_FAILED_FINAL_EVENT,
  retryableJobIdOf,
  WEBHOOK_EVENT_ABANDONED_EVENT,
} from "@sellbridge/shared/job-failures";

/** What "Tentar de novo" runs again for a problem. */
export type ProblemRetry =
  | { readonly kind: "webhook_event"; readonly webhookEventId: string }
  | { readonly kind: "job"; readonly queue: string; readonly jobId: string };

function stringOf(context: Record<string, unknown>, key: string): string | null {
  const value = context[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * The retry a problem offers, from its event and stored context; null when there is none (the
 * problem resolves on its own or needs a person, not a second run).
 */
export function problemRetryOf(
  event: string,
  context: Record<string, unknown>,
): ProblemRetry | null {
  if (event === WEBHOOK_EVENT_ABANDONED_EVENT) {
    const webhookEventId = stringOf(context, "webhookEventId");
    return webhookEventId === null ? null : { kind: "webhook_event", webhookEventId };
  }
  if (event !== JOB_FAILED_FINAL_EVENT) {
    return null;
  }
  const queue = stringOf(context, "queue");
  if (queue === null) {
    return null;
  }
  const jobId = retryableJobIdOf(queue, context);
  return jobId === null ? null : { kind: "job", queue, jobId };
}
