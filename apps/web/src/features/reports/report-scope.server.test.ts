import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/environment", () => ({
  environment: { PLATFORM_FEE_BASIS_POINTS: 0 },
}));

import { buildReportScope, comparisonScope } from "./report-scope.server";

/*
 * Regression: the financial page compared the totals with the whole previous period while the
 * dashboard cut it at the current hour, so the same "vs. período anterior" read 29% on one and
 * 31% on the other. Both now take their base from here.
 */
describe("comparisonScope", () => {
  it("compares an ongoing period with the same stretch of the one before", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    const { period, scope } = buildReportScope("tenant", { period: "7d" }, now);
    const lived = now.getTime() - period.from.getTime();

    const previous = comparisonScope(scope, period, now);

    expect(previous.range.from).toEqual(period.previousFrom);
    expect(previous.range.to.getTime()).toBe(period.previousFrom.getTime() + lived);
    expect(previous.range.to.getTime()).toBeLessThan(period.previousTo.getTime());
  });
});
