import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOrderMessageFollowUpProcessor } from "./order-message-follow-up.ts";

const mocks = {
  loadMessages:
    vi.fn<(shipmentId: string) => Promise<{ at: Date; author: "reseller" | "supplier" }[]>>(),
  deliver: vi.fn<(input: unknown) => Promise<void>>(),
};

const START = new Date("2026-10-22T13:00:00Z").getTime();
const MINUTE = 60_000;
const SHIPMENT = "8b9e1d2c-3f4a-4b5c-8d6e-7f8091a2b3c4";

function runAt(minute: number) {
  return createOrderMessageFollowUpProcessor({
    loadMessages: mocks.loadMessages,
    deliver: mocks.deliver,
    now: () => new Date(START + minute * MINUTE),
  });
}

function message(minute: number, author: "reseller" | "supplier") {
  return { at: new Date(START + minute * MINUTE), author };
}

const JOB = { data: { shipmentId: SHIPMENT, author: "reseller" }, attemptsMade: 0, maxAttempts: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deliver.mockResolvedValue(undefined);
});

describe("order message follow-up job", () => {
  it("e-mails the message of 10:05 at 10:15 when nothing came after it", async () => {
    mocks.loadMessages.mockResolvedValue([message(0, "reseller"), message(5, "reseller")]);
    await runAt(15)(JOB);
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the other side answered in the conversation", async () => {
    mocks.loadMessages.mockResolvedValue([
      message(0, "reseller"),
      message(5, "reseller"),
      message(8, "supplier"),
    ]);
    await runAt(15)(JOB);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("does nothing when the message was already e-mailed", async () => {
    mocks.loadMessages.mockResolvedValue([message(0, "reseller")]);
    await runAt(15)(JOB);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("refuses a job with an unknown author", async () => {
    await expect(
      runAt(15)({ ...JOB, data: { shipmentId: SHIPMENT, author: "team" } }),
    ).rejects.toThrow("author");
  });
});
