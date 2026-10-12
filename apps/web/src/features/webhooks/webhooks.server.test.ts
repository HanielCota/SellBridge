import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordWebhookEvent: vi.fn<(database: unknown, input: unknown) => Promise<unknown>>(),
  enqueueWebhookEvent: vi.fn<(webhookEventId: string) => Promise<void>>(),
  verifyWebhook: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/marketplaces", () => ({
  connectors: { mock: { verifyWebhook: mocks.verifyWebhook } },
}));
vi.mock("@/lib/server/queues", () => ({ enqueueWebhookEvent: mocks.enqueueWebhookEvent }));
vi.mock("@sellbridge/database/repositories", () => ({
  recordWebhookEvent: mocks.recordWebhookEvent,
}));

const { handleWebhook } = await import("./webhooks.server");

function notification(): Request {
  return new Request("http://localhost/api/webhooks/mock", {
    method: "POST",
    body: JSON.stringify({ id: "evt-1" }),
  });
}

async function deliver() {
  const response = await handleWebhook(notification(), "mock");
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyWebhook.mockResolvedValue({
    valid: true,
    event: { externalEventId: "evt-1", topic: "orders", payload: {} },
  });
  mocks.enqueueWebhookEvent.mockResolvedValue(undefined);
});

describe("handleWebhook", () => {
  it("enqueues a new event", async () => {
    mocks.recordWebhookEvent.mockResolvedValue({ status: "created", id: "event-1" });
    expect(await deliver()).toEqual({ status: 200, body: { status: "recebido" } });
    expect(mocks.enqueueWebhookEvent).toHaveBeenCalledWith("event-1");
  });

  it("enqueues again a duplicate that was never processed", async () => {
    mocks.recordWebhookEvent.mockResolvedValue({
      status: "duplicate",
      id: "event-2",
      pending: true,
    });
    expect(await deliver()).toEqual({ status: 200, body: { status: "duplicado" } });
    expect(mocks.enqueueWebhookEvent).toHaveBeenCalledWith("event-2");
  });

  it("does not enqueue a duplicate already processed", async () => {
    mocks.recordWebhookEvent.mockResolvedValue({
      status: "duplicate",
      id: "event-3",
      pending: false,
    });
    expect(await deliver()).toEqual({ status: 200, body: { status: "duplicado" } });
    expect(mocks.enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it("answers in time when Redis hangs, leaving the stored event to the sweeper", async () => {
    mocks.recordWebhookEvent.mockResolvedValue({ status: "created", id: "event-4" });
    mocks.enqueueWebhookEvent.mockReturnValue(new Promise(() => {}));
    const startedAt = Date.now();
    expect(await deliver()).toEqual({ status: 200, body: { status: "recebido" } });
    expect(Date.now() - startedAt).toBeLessThan(500);
  });
});
