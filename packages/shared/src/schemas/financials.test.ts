import { describe, expect, it } from "vitest";
import { financialSearchSchema, stageOfStatus } from "./financials.ts";
import { ORDER_STATUSES } from "./orders.ts";

describe("stageOfStatus", () => {
  it("maps every order status to the stage that lists it", () => {
    const stages = Object.fromEntries(
      ORDER_STATUSES.map((status) => [status, stageOfStatus(status)]),
    );
    expect(stages).toEqual({
      pending: "open",
      paid: "open",
      shipped: "shipping",
      delivered: "done",
      cancelled: "issue",
      returned: "issue",
    });
  });
});

describe("financialSearchSchema", () => {
  it("keeps the stage filter", () => {
    expect(financialSearchSchema.parse({ stage: "shipping" }).stage).toBe("shipping");
  });

  it("turns a legacy status filter into its stage", () => {
    const search = financialSearchSchema.parse({ status: "paid" });
    expect(search.stage).toBe("open");
    expect(search).not.toHaveProperty("status");
    expect(financialSearchSchema.parse({ status: "returned" }).stage).toBe("issue");
  });

  it("prefers the stage when both are present", () => {
    expect(financialSearchSchema.parse({ stage: "done", status: "paid" }).stage).toBe("done");
  });

  it("ignores an unknown status", () => {
    expect(financialSearchSchema.parse({ status: "lost" }).stage).toBeUndefined();
  });
});
