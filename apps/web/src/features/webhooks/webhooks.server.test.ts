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

/** A chunked body: no Content-Length, so only the bytes read tell its size. */
function streamed(bytes: number): Request {
  const chunk = new Uint8Array(1024).fill(97);
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= bytes) return controller.close();
      const size = Math.min(chunk.byteLength, bytes - sent);
      controller.enqueue(chunk.subarray(0, size));
      sent += size;
    },
  });
  return new Request("http://localhost/api/webhooks/mock", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
}

describe("webhook body limits", () => {
  it("reads a body of exactly 64 KB and refuses one byte more, even without Content-Length", async () => {
    mocks.recordWebhookEvent.mockResolvedValue({ status: "created", id: "wh-1", pending: true });
    expect((await handleWebhook(streamed(64 * 1024), "mock")).status).toBe(200);
    expect((await handleWebhook(streamed(64 * 1024 + 1), "mock")).status).toBe(413);
    expect(mocks.verifyWebhook).toHaveBeenCalledTimes(1);
  });

  it("stores only the size of a large rejected body", async () => {
    mocks.recordWebhookEvent.mockResolvedValue({ status: "created", id: "wh-2", pending: false });
    mocks.verifyWebhook.mockResolvedValue({
      valid: false,
      reason: "forma inválida",
      payload: { body: "a".repeat(10_000) },
    });
    expect((await handleWebhook(notification(), "mock")).status).toBe(401);
    expect(mocks.recordWebhookEvent.mock.calls[0]?.[1]).toMatchObject({
      rawPayload: { truncated: true, bytes: 10_011 },
    });
  });

  it("drops the NUL escape that jsonb refuses", async () => {
    mocks.recordWebhookEvent.mockResolvedValue({ status: "created", id: "wh-3", pending: true });
    mocks.verifyWebhook.mockResolvedValue({
      valid: true,
      event: { externalEventId: "evt-2", topic: "orders", payload: { note: "a\u0000b" } },
    });
    await handleWebhook(notification(), "mock");
    expect(mocks.recordWebhookEvent.mock.calls[0]?.[1]).toMatchObject({
      rawPayload: { note: "ab" },
    });
  });
});
