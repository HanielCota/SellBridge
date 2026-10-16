import { describe, expect, it } from "vitest";
import { firstDayWithin } from "./dashboard-metrics";

describe("firstDayWithin", () => {
  // Regression: a period starting on Sunday 1 March named its best (first, partial) week as
  // starting on Monday 23 February, a day outside the period.
  it("names a partial first week from the period's first day", () => {
    expect(firstDayWithin("2026-02-23", "2026-03-01")).toBe("2026-03-01");
  });

  it("keeps a bucket that starts inside the period", () => {
    expect(firstDayWithin("2026-03-01", "2026-03-01")).toBe("2026-03-01");
    expect(firstDayWithin("2026-03-02", "2026-03-01")).toBe("2026-03-02");
  });
});
