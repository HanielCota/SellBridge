import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "bling-client-secret";

const mocks = vi.hoisted(() => ({
  findSuppliers: vi.fn<(...input: unknown[]) => Promise<string[]>>(),
  recordNotice: vi.fn<(...input: unknown[]) => Promise<void>>(),
  enqueue: vi.fn<(supplierId: string) => Promise<void>>(),
  markSeen: vi.fn<(eventId: string) => Promise<boolean>>(),
  forget: vi.fn<(eventId: string) => Promise<void>>(),
  credentials: { clientId: "id", clientSecret: "bling-client-secret" } as {
    clientId: string;
    clientSecret: string;
  } | null,
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findErpStockSuppliersByCompany: mocks.findSuppliers,
  recordErpStockNotice: mocks.recordNotice,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/queues", () => ({
  enqueueErpStockRefresh: mocks.enqueue,
  markErpNoticeSeen: mocks.markSeen,
  forgetErpNotice: mocks.forget,
}));
vi.mock("./bling-access.server", () => ({ blingCredentials: () => mocks.credentials }));

import { handleBlingWebhook } from "./bling-webhook.server";

const stockNotice = {
  eventId: "01945027-150b-7c16-ab12-a4a7aa8e8a47",
  date: "2026-11-19T12:00:00Z",
  version: "v1",
  event: "stock.updated",
  companyId: "d4475854366a36c86a37e792f9634a51",
  data: { produto: { id: 12345678 }, saldoVirtualTotal: 3 },
};

function signature(rawBody: Uint8Array, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

function noticeBytes(rawBody: Uint8Array<ArrayBuffer>, signed: string | null): Request {
  return new Request("http://localhost:3630/api/webhooks/bling", {
    method: "POST",
    headers: signed === null ? {} : { "X-Bling-Signature-256": signed },
    body: rawBody,
  });
}

function notice(body: unknown, sign: (rawBody: Uint8Array) => string | null = signature): Request {
  const rawBody = new TextEncoder().encode(JSON.stringify(body));
  return noticeBytes(rawBody, sign(rawBody));
}

beforeEach(() => {
  mocks.findSuppliers.mockReset().mockResolvedValue(["supplier-1"]);
  mocks.recordNotice.mockReset().mockResolvedValue(undefined);
  mocks.enqueue.mockReset().mockResolvedValue(undefined);
  mocks.markSeen.mockReset().mockResolvedValue(true);
  mocks.forget.mockReset().mockResolvedValue(undefined);
  mocks.credentials = { clientId: "id", clientSecret: SECRET };
});

describe("handleBlingWebhook", () => {
  it("stores a signed stock notice for the company's supplier and queues its read", async () => {
    const response = await handleBlingWebhook(notice(stockNotice));

    expect(response.status).toBe(200);
    expect(mocks.findSuppliers).toHaveBeenCalledWith({}, stockNotice.companyId);
    expect(mocks.recordNotice).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ supplierIds: ["supplier-1"], erpProductIds: [12345678] }),
    );
    expect(mocks.enqueue).toHaveBeenCalledWith("supplier-1");
  });

  it("refuses a notice signed with another secret and stores nothing", async () => {
    const response = await handleBlingWebhook(
      notice(stockNotice, (rawBody) => signature(rawBody, "forged")),
    );

    expect(response.status).toBe(401);
    expect(mocks.recordNotice).not.toHaveBeenCalled();
  });

  it("refuses a notice without a signature", async () => {
    const response = await handleBlingWebhook(notice(stockNotice, () => null));

    expect(response.status).toBe(401);
  });

  it("answers 200 to a signed event it does not use, so Bling keeps the webhook on", async () => {
    const response = await handleBlingWebhook(notice({ ...stockNotice, event: "order.created" }));

    expect(response.status).toBe(200);
    expect(mocks.findSuppliers).not.toHaveBeenCalled();
  });

  it("answers 200 to a company no supplier follows", async () => {
    mocks.findSuppliers.mockResolvedValue([]);

    const response = await handleBlingWebhook(notice(stockNotice));

    expect(response.status).toBe(200);
    expect(mocks.recordNotice).not.toHaveBeenCalled();
  });

  it("still answers 200 when the queue is down: the stored notice waits for the check", async () => {
    mocks.enqueue.mockRejectedValue(new Error("redis down"));

    const response = await handleBlingWebhook(notice(stockNotice));

    expect(response.status).toBe(200);
    expect(mocks.recordNotice).toHaveBeenCalled();
  });

  it("is not found while the Bling app keys are not set", async () => {
    mocks.credentials = null;

    const response = await handleBlingWebhook(notice(stockNotice));

    expect(response.status).toBe(404);
  });

  it("accepts a notice whose signed bytes start with a BOM", async () => {
    const json = new TextEncoder().encode(JSON.stringify(stockNotice));
    const rawBody = new Uint8Array([0xef, 0xbb, 0xbf, ...json]);

    const response = await handleBlingWebhook(noticeBytes(rawBody, signature(rawBody)));

    expect(response.status).toBe(200);
    expect(mocks.recordNotice).toHaveBeenCalled();
  });

  it("does not store or read again a notice whose event was already received", async () => {
    mocks.markSeen.mockResolvedValue(false);

    const response = await handleBlingWebhook(notice(stockNotice));

    expect(response.status).toBe(200);
    expect(mocks.markSeen).toHaveBeenCalledWith(stockNotice.eventId);
    expect(mocks.recordNotice).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("forgets the event when storing fails, so the retry from Bling is accepted", async () => {
    mocks.recordNotice.mockRejectedValue(new Error("database down"));

    await expect(handleBlingWebhook(notice(stockNotice))).rejects.toThrow("database down");

    expect(mocks.forget).toHaveBeenCalledWith(stockNotice.eventId);
  });

  it("still stores the notice when the repeat check cannot reach Redis", async () => {
    mocks.markSeen.mockRejectedValue(new Error("redis down"));

    const response = await handleBlingWebhook(notice(stockNotice));

    expect(response.status).toBe(200);
    expect(mocks.recordNotice).toHaveBeenCalled();
  });
});
