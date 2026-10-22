import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderMessageMoments: vi.fn<() => Promise<unknown[]>>(),
  deliverOrderMessageNotice: vi.fn<(delivery: unknown, input: unknown) => Promise<void>>(),
  enqueueOrderMessageFollowUp: vi.fn<(input: unknown) => Promise<void>>(),
}));

vi.mock("@sellbridge/database/repositories", () => ({
  orderMessageMoments: mocks.orderMessageMoments,
  deliverOrderMessageNotice: mocks.deliverOrderMessageNotice,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: { APP_URL: "https://app.sellbridge.test" },
}));
vi.mock("@/lib/server/mailer", () => ({ sendEmail: vi.fn<() => Promise<void>>() }));
vi.mock("@/lib/server/queues", () => ({
  enqueueOrderMessageFollowUp: mocks.enqueueOrderMessageFollowUp,
}));

const { noticeOrderMessage } = await import("./order-message-notice.server");

const START = new Date("2026-10-22T13:00:00Z").getTime();
const MINUTE = 60_000;

/** The author's messages at these minutes, each noticed as it is saved, at that time. */
async function writes(author: "reseller" | "supplier", minutes: readonly number[]) {
  for (const [index, minute] of minutes.entries()) {
    vi.setSystemTime(START + minute * MINUTE);
    const saved = minutes
      .slice(0, index + 1)
      .map((savedMinute) => ({ at: new Date(START + savedMinute * MINUTE), author }));
    mocks.orderMessageMoments.mockResolvedValueOnce(saved);
    await noticeOrderMessage({ shipmentId: "parcel-1", author, messageKey: `m${index}` });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.deliverOrderMessageNotice.mockResolvedValue(undefined);
  mocks.enqueueOrderMessageFollowUp.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("noticeOrderMessage", () => {
  it("e-mails the first message and holds the rest of a burst for the window's end", async () => {
    await writes("reseller", [0, 0.4, 0.7]);
    expect(mocks.deliverOrderMessageNotice).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueOrderMessageFollowUp).toHaveBeenCalledTimes(2);
    expect(mocks.enqueueOrderMessageFollowUp).toHaveBeenLastCalledWith({
      shipmentId: "parcel-1",
      author: "reseller",
      runAt: new Date(START + 15 * MINUTE),
    });
  });

  it("schedules the last message of a short burst instead of losing it", async () => {
    // 10:00 "Oi"; 10:05 "O cliente pediu para trocar o endereço."; then nothing.
    await writes("reseller", [0, 5]);
    expect(mocks.deliverOrderMessageNotice).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueOrderMessageFollowUp).toHaveBeenCalledWith({
      shipmentId: "parcel-1",
      author: "reseller",
      runAt: new Date(START + 15 * MINUTE),
    });
  });

  it("notices the store the same way when the supplier writes", async () => {
    await writes("supplier", [0]);
    expect(mocks.deliverOrderMessageNotice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ author: "supplier", shipmentId: "parcel-1" }),
    );
  });

  it("never undoes the message when the notice fails", async () => {
    mocks.deliverOrderMessageNotice.mockRejectedValueOnce(new Error("Resend fora"));
    await expect(writes("reseller", [0])).resolves.toBeUndefined();
  });
});
