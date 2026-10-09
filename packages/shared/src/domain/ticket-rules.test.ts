import { describe, expect, it } from "vitest";
import { hasErrorCode } from "../runtime/errors.ts";
import { assertCanReply, nextTicketStatus } from "./ticket-rules.ts";

describe("assertCanReply", () => {
  it("blocks a support reply on a closed ticket", () => {
    let thrown: unknown = null;
    try {
      assertCanReply("closed", true);
    } catch (error) {
      thrown = error;
    }
    expect(hasErrorCode(thrown, "CONFLICT")).toBe(true);
  });

  it("lets the reseller write on a closed ticket and support answer open ones", () => {
    expect(() => assertCanReply("closed", false)).not.toThrow();
    expect(() => assertCanReply("open", true)).not.toThrow();
    expect(() => assertCanReply("answered", true)).not.toThrow();
  });
});

describe("nextTicketStatus", () => {
  it("marks support replies as answered and reseller messages as open", () => {
    expect(nextTicketStatus(true)).toBe("answered");
    expect(nextTicketStatus(false)).toBe("open");
  });
});
