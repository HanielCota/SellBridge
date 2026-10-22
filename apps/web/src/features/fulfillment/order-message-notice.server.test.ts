import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOrderMessageContext: vi.fn<() => Promise<unknown>>(),
  orderMessageTimes: vi.fn<() => Promise<Date[]>>(),
  queueOrderMessageNotices: vi.fn<() => Promise<number>>(),
  sendEmail: vi.fn<() => Promise<void>>(),
}));

vi.mock("@sellbridge/database/repositories", () => ({
  findOrderMessageContext: mocks.findOrderMessageContext,
  orderMessageTimes: mocks.orderMessageTimes,
  queueOrderMessageNotices: mocks.queueOrderMessageNotices,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: { APP_URL: "https://app.sellbridge.test" },
}));
vi.mock("@/lib/server/mailer", () => ({ sendEmail: mocks.sendEmail }));

const { noticeOrderMessage } = await import("./order-message-notice.server");

const CONTEXT = {
  tenantId: "tenant-a",
  orderId: "order-1",
  externalOrderId: "2000012345",
  forwardedAt: new Date("2026-10-22T12:00:00Z"),
  supplierEmail: "pedidos@fornecedor.test",
  supplierHasAccount: false,
};
const START = new Date("2026-10-22T13:00:00Z").getTime();
const MINUTE = 60_000;

/**
 * The author's messages at these minutes, each noticed as it is saved: the database then holds it
 * and every earlier one.
 */
async function writes(author: "reseller" | "supplier", minutes: readonly number[]) {
  for (const [index] of minutes.entries()) {
    const saved = minutes.slice(0, index + 1).map((minute) => new Date(START + minute * MINUTE));
    mocks.orderMessageTimes.mockResolvedValueOnce(saved);
    await noticeOrderMessage({ shipmentId: "parcel-1", author, messageKey: `m${index}` });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findOrderMessageContext.mockResolvedValue(CONTEXT);
  mocks.sendEmail.mockResolvedValue(undefined);
  mocks.queueOrderMessageNotices.mockResolvedValue(1);
});

describe("noticeOrderMessage keeps one e-mail per author and parcel every 15 minutes", () => {
  it("e-mails the supplier once for three messages sent within a minute", async () => {
    await writes("reseller", [0, 0.4, 0.7]);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("e-mails again for a message 15 minutes after the last e-mail", async () => {
    await writes("reseller", [0, 0.5, 15.5]);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("keeps a steady conversation reaching the supplier: a message every 10 minutes", async () => {
    await writes("reseller", [0, 10, 20, 30, 40, 50, 60]);
    // E-mails at 0, 20, 40 and 60: never one alone, never two in the same 15 minutes.
    expect(mocks.sendEmail).toHaveBeenCalledTimes(4);
  });

  it("keeps the store's e-mail to the same pace when the supplier writes in a row", async () => {
    await writes("supplier", [0, 0.2]);
    expect(mocks.queueOrderMessageNotices).toHaveBeenCalledTimes(1);
  });
});
