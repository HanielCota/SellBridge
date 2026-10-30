import { describe, expect, it } from "vitest";
import {
  enqueueStoreOrderCatchUpJob,
  enqueueWebhookEventJob,
  pingQueueConnection,
  type StoreOrderCatchUpQueue,
  storeOrderCatchUpJobId,
  WEBHOOK_JOB_OPTIONS,
  type WebhookEventQueue,
} from "./queues.ts";

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

/** Dispatches like BullMQ's `runCommand`: by ioredis method name, failing on any other. */
function queueAnswering(answer: () => Promise<unknown>) {
  const methods: Record<string, () => Promise<unknown>> = { ping: answer };
  const runCommand = async (name: string) => {
    const method = methods[name];
    if (method === undefined) {
      throw new TypeError("client[name] is not a function");
    }
    return method();
  };
  return { getBackend: () => ({ client: Promise.resolve({ runCommand }) }) };
}

describe("pingQueueConnection", () => {
  it("is healthy only when Redis answers PONG", async () => {
    expect(await pingQueueConnection(queueAnswering(async () => "PONG"))).toBe(true);
    expect(await pingQueueConnection(queueAnswering(async () => "LOADING"))).toBe(false);
  });

  it("lets a connection error reach the health check", async () => {
    const refused = queueAnswering(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(pingQueueConnection(refused)).rejects.toThrow("ECONNREFUSED");
  });
});

describe("storeOrderCatchUpJobId", () => {
  const storeConnectionId = "6bbcac6b-80ef-483d-aa1d-305941d8cb77";

  it("names the job after the store and the start time in milliseconds", () => {
    const job = { storeConnectionId, since: "2026-10-20T00:00:00.000Z" };

    const jobId = storeOrderCatchUpJobId(job);

    expect(jobId).toBe(`order-catch-up-${storeConnectionId}-1792454400000`);
  });

  // Regression (review, 29/10/2026): an unreadable start date produced an id ending in "NaN".
  it("throws when the start date cannot be read", () => {
    const job = { storeConnectionId, since: "not-a-date" };

    const build = () => storeOrderCatchUpJobId(job);

    expect(build).toThrow(/catch-up start date/);
  });
});

/** In-memory catch-up queue holding, at most, one job in the given state under any id. */
function createFakeCatchUpQueue(existingState: string | null) {
  const calls = { removed: [] as string[], added: [] as string[] };
  const queue: StoreOrderCatchUpQueue = {
    getJob: async (jobId) => {
      if (existingState === null) {
        return undefined;
      }
      return {
        getState: async () => existingState,
        remove: async () => {
          calls.removed.push(jobId);
        },
      };
    },
    add: async (_name, _data, options) => {
      calls.added.push(options.jobId);
    },
  };
  return { queue, calls };
}

describe("enqueueStoreOrderCatchUpJob", () => {
  const catchUp = {
    storeConnectionId: "6bbcac6b-80ef-483d-aa1d-305941d8cb77",
    since: "2026-10-20T00:00:00.000Z",
  };
  const jobId = "order-catch-up-6bbcac6b-80ef-483d-aa1d-305941d8cb77-1792454400000";

  it("adds the catch-up when no job holds its id", async () => {
    const { queue, calls } = createFakeCatchUpQueue(null);

    await enqueueStoreOrderCatchUpJob(queue, catchUp);

    expect(calls).toEqual({ removed: [], added: [jobId] });
  });

  // Regression (review, 29/10/2026): a store first connected less than a month ago asks from the
  // same point on every reconnection, and BullMQ silently dropped the second catch-up.
  it.each(["completed", "failed"])(
    "replaces a %s catch-up of an earlier reconnection",
    async (state) => {
      const { queue, calls } = createFakeCatchUpQueue(state);

      await enqueueStoreOrderCatchUpJob(queue, catchUp);

      expect(calls).toEqual({ removed: [jobId], added: [jobId] });
    },
  );

  it.each(["waiting", "delayed", "active"])("leaves a %s catch-up alone", async (state) => {
    const { queue, calls } = createFakeCatchUpQueue(state);

    await enqueueStoreOrderCatchUpJob(queue, catchUp);

    expect(calls).toEqual({ removed: [], added: [] });
  });

  it("refuses a job whose start date is not a date", async () => {
    const { queue, calls } = createFakeCatchUpQueue(null);

    const enqueue = enqueueStoreOrderCatchUpJob(queue, { ...catchUp, since: "not-a-date" });

    await expect(enqueue).rejects.toThrow(/since/);
    expect(calls).toEqual({ removed: [], added: [] });
  });
});
