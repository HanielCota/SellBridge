import { describe, expect, it } from "vitest";
import { hasErrorCode } from "../runtime/errors.ts";
import {
  assertCanRate,
  assertCanReply,
  assertCustomerCanClose,
  awaitingAfterMessage,
  awaitingAfterStatus,
  nextTicketStatus,
  responseDueAt,
  responseTiming,
} from "./ticket-rules.ts";

function errorCodeOf(run: () => void): string | null {
  try {
    run();
  } catch (error) {
    return hasErrorCode(error, "CONFLICT") ? "CONFLICT" : "OTHER";
  }
  return null;
}

describe("assertCanReply", () => {
  it("blocks a support reply on a closed ticket", () => {
    let thrown: unknown = null;
    try {
      assertCanReply("closed", "reply");
    } catch (error) {
      thrown = error;
    }
    expect(hasErrorCode(thrown, "CONFLICT")).toBe(true);
  });

  it("lets the reseller write and support take notes on a closed ticket", () => {
    expect(() => assertCanReply("closed", "reseller")).not.toThrow();
    expect(() => assertCanReply("closed", "note")).not.toThrow();
    expect(() => assertCanReply("open", "reply")).not.toThrow();
    expect(() => assertCanReply("answered", "reply")).not.toThrow();
  });
});

describe("nextTicketStatus", () => {
  it("marks support replies as answered and reseller messages as open", () => {
    expect(nextTicketStatus("open", "reply")).toBe("answered");
    expect(nextTicketStatus("answered", "reseller")).toBe("open");
    expect(nextTicketStatus("closed", "reseller")).toBe("open");
  });

  it("honours the status support chose to send the reply with", () => {
    expect(nextTicketStatus("open", "reply", "closed")).toBe("closed");
    expect(nextTicketStatus("open", "reply", "open")).toBe("open");
  });

  it("keeps the status when support only adds an internal note", () => {
    expect(nextTicketStatus("open", "note", "closed")).toBe("open");
    expect(nextTicketStatus("closed", "note")).toBe("closed");
  });
});

describe("awaitingAfterMessage", () => {
  const earlier = new Date("2026-10-12T09:00:00Z");
  const now = new Date("2026-10-12T12:00:00Z");

  it("starts the clock at the first unanswered reseller message and keeps it running", () => {
    expect(awaitingAfterMessage(null, "reseller", now)).toEqual(now);
    expect(awaitingAfterMessage(earlier, "reseller", now)).toEqual(earlier);
  });

  it("stops on any support reply and ignores internal notes", () => {
    expect(awaitingAfterMessage(earlier, "reply", now)).toBeNull();
    expect(awaitingAfterMessage(earlier, "note", now)).toEqual(earlier);
    expect(awaitingAfterMessage(null, "note", now)).toBeNull();
  });
});

describe("awaitingAfterStatus", () => {
  const earlier = new Date("2026-10-12T09:00:00Z");
  const now = new Date("2026-10-12T12:00:00Z");

  it("puts a reopened ticket back in the queue and stops the clock otherwise", () => {
    expect(awaitingAfterStatus(null, "open", now)).toEqual(now);
    expect(awaitingAfterStatus(earlier, "open", now)).toEqual(earlier);
    expect(awaitingAfterStatus(earlier, "closed", now)).toBeNull();
    expect(awaitingAfterStatus(earlier, "answered", now)).toBeNull();
  });
});

describe("responseTiming", () => {
  const since = new Date("2026-10-12T09:00:00Z");

  it("gives each priority its own deadline", () => {
    expect(responseDueAt(since, "urgent").toISOString()).toBe("2026-10-12T11:00:00.000Z");
    expect(responseDueAt(since, "high").toISOString()).toBe("2026-10-12T17:00:00.000Z");
    expect(responseDueAt(since, "normal").toISOString()).toBe("2026-10-13T09:00:00.000Z");
    expect(responseDueAt(since, "low").toISOString()).toBe("2026-10-14T09:00:00.000Z");
  });

  it("reports the time left, the delay, or nothing when no answer is owed", () => {
    expect(responseTiming(null, "normal", since)).toEqual({ state: "none" });
    expect(responseTiming(since, "urgent", new Date("2026-10-12T10:00:00Z"))).toMatchObject({
      state: "on_time",
      remainingMilliseconds: 3_600_000,
    });
    expect(responseTiming(since, "urgent", new Date("2026-10-12T11:30:00Z"))).toMatchObject({
      state: "overdue",
      lateMilliseconds: 1_800_000,
    });
  });
});

describe("closing and rating", () => {
  it("lets the reseller close an open or answered ticket once", () => {
    expect(errorCodeOf(() => assertCustomerCanClose("open"))).toBeNull();
    expect(errorCodeOf(() => assertCustomerCanClose("answered"))).toBeNull();
    expect(errorCodeOf(() => assertCustomerCanClose("closed"))).toBe("CONFLICT");
  });

  it("only rates a closed ticket, and only once per close", () => {
    expect(errorCodeOf(() => assertCanRate("closed", null))).toBeNull();
    expect(errorCodeOf(() => assertCanRate("answered", null))).toBe("CONFLICT");
    expect(errorCodeOf(() => assertCanRate("closed", new Date()))).toBe("CONFLICT");
  });
});
