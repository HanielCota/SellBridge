/*
 * Axes of the report charts: 4 equal steps from a round number to a round number, so the grid
 * lines read "0, 25, 50, 75, 100" and the tallest value always stays inside the plot.
 */

const AXIS_STEPS = 4;
const NICE_FACTORS = [1, 2, 2.5, 5, 10] as const;

/** The smallest "nice" step (1, 2, 2.5 or 5 times a power of ten) that is at least `raw`. */
function niceStep(raw: number): number {
  if (raw <= 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const factor = NICE_FACTORS.find((candidate) => candidate * magnitude >= raw) ?? 10;
  return factor * magnitude;
}

export interface ChartAxis {
  min: number;
  max: number;
  /** Values of the grid lines, bottom to top (5 marks). */
  ticks: number[];
}

function axisFrom(min: number, step: number): ChartAxis {
  const ticks = Array.from({ length: AXIS_STEPS + 1 }, (_, index) => min + step * index);
  return { min, max: min + step * AXIS_STEPS, ticks };
}

/** Bars always start at zero: a cut axis would make a small difference look huge. */
export function barAxis(values: readonly number[]): ChartAxis {
  const top = Math.max(0, ...values);
  return axisFrom(0, niceStep(top / AXIS_STEPS));
}

/**
 * A line may start above zero (rates around 90% would be a flat line on a 0–100% axis), but the
 * target and every value stay inside, with a step of margin when the values touch the edges.
 */
export function lineAxis(
  values: readonly number[],
  target: number | null,
  ceiling: number | null = null,
): ChartAxis {
  const axis = freeLineAxis(values, target);
  // A rate never passes 100%: all months at 0% against a 90% target drew an axis up to 200%.
  if (ceiling === null || axis.max <= ceiling) {
    return axis;
  }
  const min = Math.min(axis.min, ceiling);
  return axisFrom(min, (ceiling - min) / AXIS_STEPS);
}

function freeLineAxis(values: readonly number[], target: number | null): ChartAxis {
  const all = target === null ? [...values] : [...values, target];
  if (all.length === 0) {
    return axisFrom(0, 1);
  }
  const low = Math.min(...all);
  const high = Math.max(...all);
  const spread = high - low;
  const step = niceStep((spread === 0 ? Math.max(Math.abs(high), 1) : spread * 1.25) / AXIS_STEPS);
  const min = Math.max(0, Math.floor(low / step) * step - (spread === 0 ? step * 2 : 0));
  const axis = axisFrom(min, step);
  if (axis.max >= high) {
    return axis;
  }
  return axisFrom(min, niceStep((high - min) / AXIS_STEPS));
}

/** Where a value sits in the plot, 0 (bottom) to 100 (top). */
export function positionOf(value: number, axis: ChartAxis): number {
  const span = axis.max - axis.min;
  if (span <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, ((value - axis.min) / span) * 100));
}
