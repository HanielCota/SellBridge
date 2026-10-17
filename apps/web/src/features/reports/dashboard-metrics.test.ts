import { describe, expect, it } from "vitest";
import {
  firstDayWithin,
  formatAxisDate,
  formatPeriodCaption,
  formatTooltipDate,
} from "./dashboard-metrics";

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

describe("hourly labels", () => {
  it("names an hour on the axis and in the tooltip", () => {
    expect(formatAxisDate("2026-10-16T09:00", "hour")).toBe("9h");
    expect(formatTooltipDate("2026-10-16T14:00", "hour")).toBe("16 de out., 14h");
  });
});

describe("formatPeriodCaption", () => {
  // Regression: one day read "10 de out. – 10 de out. de 2026 · comparado com os 1 dias anteriores".
  it("names a single day once and compares it with the day before", () => {
    expect(formatPeriodCaption({ fromDate: "2026-10-10", toDate: "2026-10-10", days: 1 })).toBe(
      "10 de out. de 2026 · comparado com o dia anterior",
    );
  });

  it("names a range and its comparison window", () => {
    expect(formatPeriodCaption({ fromDate: "2026-10-01", toDate: "2026-10-07", days: 7 })).toBe(
      "1 de out. – 7 de out. de 2026 · comparado com os 7 dias anteriores",
    );
  });
});
