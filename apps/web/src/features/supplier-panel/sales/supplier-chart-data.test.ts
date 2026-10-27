import { describe, expect, it } from "vitest";
import { buildProductRows, toMetricPoints } from "./supplier-chart-data";

const points = [
  { date: "2026-10-01", orders: 2, units: 5, receivableCents: 20_000 },
  { date: "2026-10-02", orders: 0, units: 0, receivableCents: 0 },
];

describe("toMetricPoints", () => {
  it("carries the chosen series as the chart's value", () => {
    expect(toMetricPoints(points, "units").map((point) => point.revenueCents)).toEqual([5, 0]);
    expect(toMetricPoints(points, "receivable").map((point) => point.revenueCents)).toEqual([
      20_000, 0,
    ]);
  });
});

describe("buildProductRows", () => {
  it("fills every date with each product's value, zero where it did not sell", () => {
    const rows = buildProductRows(
      ["2026-10-01", "2026-10-02"],
      ["dress", "shirt"],
      [
        { date: "2026-10-01", productId: "dress", units: 3, receivableCents: 9000 },
        { date: "2026-10-02", productId: "shirt", units: 1, receivableCents: 2500 },
      ],
      "units",
    );
    expect(rows).toEqual([
      { date: "2026-10-01", values: { dress: 3, shirt: 0 } },
      { date: "2026-10-02", values: { dress: 0, shirt: 1 } },
    ]);
  });
});
