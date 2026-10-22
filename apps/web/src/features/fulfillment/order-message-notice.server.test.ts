import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOrderMessageContext: vi.fn<() => Promise<unknown>>(),
  previousOrderMessageAt: vi.fn<() => Promise<Date | null>>(),
  queueOrderMessageNotices: vi.fn<() => Promise<number>>(),
  sendEmail: vi.fn<() => Promise<void>>(),
}));

vi.mock("@sellbridge/database/repositories", () => ({
  findOrderMessageContext: mocks.findOrderMessageContext,
  previousOrderMessageAt: mocks.previousOrderMessageAt,
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
const MINUTE = 60_000;

/** The reseller's messages, each with the author's previous one as the database would give it. */
async function resellerWrites(minutesAgoOfPrevious: readonly (number | null)[]) {
  for (const minutesAgo of minutesAgoOfPrevious) {
    mocks.previousOrderMessageAt.mockResolvedValueOnce(
      minutesAgo === null ? null : new Date(Date.now() - minutesAgo * MINUTE),
    );
    await noticeOrderMessage({ shipmentId: "parcel-1", author: "reseller", messageKey: "k" });
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
    await resellerWrites([null, 0.4, 0.3]);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("e-mails again for a message after 15 quiet minutes", async () => {
    await resellerWrites([null, 0.5, 15]);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("keeps the store's e-mail to the same pace when the supplier writes in a row", async () => {
    mocks.previousOrderMessageAt.mockResolvedValueOnce(null).mockResolvedValueOnce(new Date());
    await noticeOrderMessage({ shipmentId: "parcel-1", author: "supplier", messageKey: "a" });
    await noticeOrderMessage({ shipmentId: "parcel-1", author: "supplier", messageKey: "b" });
    expect(mocks.queueOrderMessageNotices).toHaveBeenCalledTimes(1);
  });
});
