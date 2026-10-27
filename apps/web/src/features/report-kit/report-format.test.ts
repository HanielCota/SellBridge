import { describe, expect, it } from "vitest";
import {
  formatCompactValue,
  formatMinutes,
  formatReportValue,
  percentile,
  rateOf,
  reportChange,
  targetLabel,
  targetStatus,
} from "./report-format";

describe("formatMinutes", () => {
  it("writes minutes, hours and days the way people say them", () => {
    expect(formatMinutes(38)).toBe("38min");
    expect(formatMinutes(200)).toBe("3h 20min");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(60 * 24 + 4 * 60)).toBe("1 dia 4h");
    expect(formatMinutes(60 * 48)).toBe("2 dias");
  });
});

describe("formatReportValue", () => {
  it("formats money, rates and ratings in Portuguese", () => {
    expect(formatReportValue(123_456, "cents")).toBe("R$ 1.234,56");
    expect(formatReportValue(0.875, "rate")).toBe("87,5%");
    expect(formatReportValue(4.25, "rating")).toBe("4,3");
    expect(formatReportValue(1200, "count")).toBe("1.200");
  });
});

describe("reportChange", () => {
  it("paints a rise green when higher is better and red when lower is better", () => {
    expect(reportChange(0.9, 0.8, "rate", "higher_is_better")).toEqual({
      direction: "up",
      tone: "good",
      amount: "10 p.p.",
    });
    expect(reportChange(12, 8, "count", "lower_is_better")).toMatchObject({
      direction: "up",
      tone: "bad",
      amount: "50%",
    });
  });

  it("keeps volume changes neutral", () => {
    expect(reportChange(5, 10, "count", "neutral")).toMatchObject({ tone: "neutral" });
  });

  it("says nothing without a previous value", () => {
    expect(reportChange(5, null, "count", "neutral")).toBeNull();
  });
});

describe("targets", () => {
  it("reads a minimum and a maximum target", () => {
    expect(targetStatus(0.92, { value: 0.9, kind: "min" })).toEqual({
      met: true,
      label: "na meta",
    });
    expect(targetStatus(0.05, { value: 0.02, kind: "max" })).toEqual({
      met: false,
      label: "acima do limite",
    });
    expect(targetLabel({ value: 0.9, kind: "min" }, "rate")).toBe("≥ 90%");
  });
});

describe("rates and percentiles", () => {
  it("never shows 0 of 0 as a rate", () => {
    expect(rateOf(0, 0)).toBeNull();
    expect(rateOf(1, 4)).toBe(0.25);
  });

  it("takes the median and the 90th percentile by nearest rank", () => {
    const values = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
    expect(percentile(values, 0.5)).toBe(5);
    expect(percentile(values, 0.9)).toBe(9);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe("formatCompactValue", () => {
  it("keeps money short enough for the axis gutter", () => {
    expect(formatCompactValue(1_500_000, "cents").replaceAll(" ", " ")).toBe("R$ 15 mil");
    expect(formatCompactValue(120_000_000, "cents").replaceAll(" ", " ")).toBe("R$ 1,2 mi");
    expect(formatCompactValue(78_450, "cents")).toBe("R$ 785");
    expect(formatCompactValue(0.9, "rate")).toBe("90%");
  });
});
