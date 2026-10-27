import { describe, expect, it } from "vitest";
import { barAxis, lineAxis, positionOf } from "./chart-scale";

describe("barAxis", () => {
  it("starts at zero and ends on a round number above the tallest bar", () => {
    expect(barAxis([12, 87, 40])).toEqual({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });
    expect(barAxis([3])).toMatchObject({ min: 0, max: 4 });
  });

  it("draws an empty chart on a 0–4 axis instead of dividing by zero", () => {
    expect(barAxis([])).toMatchObject({ min: 0, max: 4 });
  });
});

describe("lineAxis", () => {
  it("cuts the axis near the values and keeps the target inside", () => {
    const axis = lineAxis([0.86, 0.91, 0.88], 0.9);
    expect(axis.min).toBeGreaterThan(0.5);
    expect(axis.min).toBeLessThanOrEqual(0.86);
    expect(axis.max).toBeGreaterThanOrEqual(0.91);
  });

  it("keeps every value inside the plot", () => {
    for (const values of [
      [5, 5, 5],
      [0, 1000],
      [120, 135, 98, 101],
    ]) {
      const axis = lineAxis(values, null);
      for (const value of values) {
        expect(positionOf(value, axis)).toBeGreaterThanOrEqual(0);
        expect(positionOf(value, axis)).toBeLessThanOrEqual(100);
        expect(value).toBeLessThanOrEqual(axis.max);
        expect(value).toBeGreaterThanOrEqual(axis.min);
      }
    }
  });

  it("stops a rate axis at 100% even when every month is at 0%", () => {
    expect(lineAxis([0, 0, 0], 0.9, 1)).toMatchObject({ min: 0, max: 1 });
  });
});
