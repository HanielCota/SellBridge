import { describe, expect, it } from "vitest";
import { enqueueWebhookEventJob, WEBHOOK_JOB_OPTIONS, type WebhookEventQueue } from "./queues.ts";

/** In-memory stand-in for the BullMQ queue: one job per id, as BullMQ keeps them. */
function createFakeQueue(existingState: string | null) {
  const calls = { removed: 0, added: [] as { jobId: string }[] };
  const queue: WebhookEventQueue = {
    getJob: async () => {
      if (existingState === null) {
        return undefined;
      }
      return {
        getState: async () => existingState,
        remove: async () => {
          calls.removed += 1;
        },
      };
    },
    add: async (_name, _data, options) => {
      calls.added.push({ jobId: options.jobId });
    },
  };
  return { queue, calls };
}

describe("enqueueWebhookEventJob", () => {
  it("adds a job keyed by the event id when none exists", async () => {
    const { queue, calls } = createFakeQueue(null);
    await enqueueWebhookEventJob(queue, "event-1");
    expect(calls).toEqual({ removed: 0, added: [{ jobId: "event-1" }] });
  });

  it.each(["failed", "completed"])("replaces a %s job so the event runs again", async (state) => {
    const { queue, calls } = createFakeQueue(state);
    await enqueueWebhookEventJob(queue, "event-2");
    expect(calls).toEqual({ removed: 1, added: [{ jobId: "event-2" }] });
  });

  it.each(["waiting", "delayed", "active"])("leaves a %s job alone", async (state) => {
    const { queue, calls } = createFakeQueue(state);
    await enqueueWebhookEventJob(queue, "event-3");
    expect(calls).toEqual({ removed: 0, added: [] });
  });

  it("retries for about an hour before the sweeper takes over", () => {
    const { attempts, backoff } = WEBHOOK_JOB_OPTIONS;
    const totalWait = Array.from(
      { length: attempts - 1 },
      (_value, index) => backoff.delay * 2 ** index,
    ).reduce((sum, wait) => sum + wait, 0);
    expect(totalWait).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });
});
