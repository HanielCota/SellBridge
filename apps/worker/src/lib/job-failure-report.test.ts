import { QUEUE_NAMES } from "@sellbridge/shared/queues";
import { problemsLoggedBy } from "@sellbridge/shared/problem-capture-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportJobFailure } from "./job-failure-report.ts";

const ORDER_ID = "6f1c2d3e-4b5a-4c6d-8e7f-901234567890";

function failedRound(id: string) {
  return { id, name: "round", attemptsMade: 1, finishedOn: Date.now(), data: {} };
}

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("worker job failures", () => {
  it("puts the last failed attempt of an auto-forward on Problemas, ready to retry", async () => {
    const job = {
      id: `auto-forward-${ORDER_ID}`,
      name: "auto-forward",
      attemptsMade: 5,
      finishedOn: Date.now(),
      data: { orderId: ORDER_ID },
    };

    const problems = await problemsLoggedBy(() =>
      reportJobFailure(QUEUE_NAMES.orderAutoForward, job, new Error("supplier unreachable")),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      event: "job.failed_final",
      area: "orders",
      message: expect.stringContaining("encaminhamento automático do pedido"),
      context: {
        queue: QUEUE_NAMES.orderAutoForward,
        retryable: true,
        orderId: ORDER_ID,
      },
    });
  });

  it("keeps an attempt BullMQ will retry off Problemas", async () => {
    const job = { id: "j-1", name: "export", attemptsMade: 1, finishedOn: undefined, data: {} };

    const problems = await problemsLoggedBy(() =>
      reportJobFailure(QUEUE_NAMES.erpCatalogExport, job, new Error("timeout")),
    );

    expect(problems).toEqual([]);
  });

  it("groups the failures of a recurring round and offers no retry", async () => {
    const problems = await problemsLoggedBy(() => {
      reportJobFailure(QUEUE_NAMES.supplierPayments, failedRound("r-1"), new Error("db down"));
      reportJobFailure(QUEUE_NAMES.supplierPayments, failedRound("r-2"), new Error("db down"));
    });

    expect(problems).toHaveLength(2);
    expect(problems[0]?.area).toBe("payments");
    expect(problems[0]?.context.retryable).toBe(false);
    expect(problems[0]?.fingerprint).toBe(problems[1]?.fingerprint);
  });

  it("leaves publications to their own report", async () => {
    const job = { id: "p-1", name: "publish", attemptsMade: 5, finishedOn: Date.now(), data: {} };

    const problems = await problemsLoggedBy(() =>
      reportJobFailure(QUEUE_NAMES.publishListing, job, new Error("refused")),
    );

    expect(problems).toEqual([]);
  });

  it("leaves a marketplace event to the sweep, which hands it over after its retry window", async () => {
    const job = { id: "e-1", name: "webhook", attemptsMade: 8, finishedOn: Date.now(), data: {} };

    const problems = await problemsLoggedBy(() =>
      reportJobFailure(QUEUE_NAMES.webhookEvents, job, new Error("refused")),
    );

    expect(problems).toEqual([]);
  });

  // Regression: a reconnected store's catch-up shares the events queue but has no stored event
  // for the sweep to find, so leaving the whole queue out hid its final failure.
  it("puts a reconnected store's failed catch-up on Problemas", async () => {
    const job = {
      id: "order-catch-up-1",
      name: "order-catch-up",
      attemptsMade: 8,
      finishedOn: Date.now(),
      data: { storeConnectionId: ORDER_ID },
    };

    const problems = await problemsLoggedBy(() =>
      reportJobFailure(QUEUE_NAMES.webhookEvents, job, new Error("listOrders failed")),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      event: "job.failed_final",
      message: expect.stringContaining("enquanto a loja estava desconectada"),
      context: { retryable: false, storeConnectionId: ORDER_ID },
    });
  });
});
