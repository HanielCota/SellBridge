import { previousBucketIndexes } from "./chart-view";

/** One bucket of a tile's chart: this period's value and the same stretch of the one before. */
export interface KpiStoryPoint {
  date: string;
  /** Null when the bucket has no value (an average ticket on a day without sales). */
  value: number | null;
  /** Null when no previous bucket lands here, or its average has nothing to divide by. */
  previous: number | null;
}

/**
 * How a tile reads a bucket: a plain total (orders, revenue), or an average when `per` is given
 * (the ticket is the revenue per order). An average is empty where `per` is zero.
 */
export interface KpiMeasure<Point> {
  amount: (point: Point) => number;
  per?: (point: Point) => number;
}

interface Totals {
  amount: number;
  per: number;
}

function averageOf(totals: Totals): number | null {
  const average = totals.amount / totals.per;
  if (totals.per > 0 && Number.isFinite(average)) {
    return Math.round(average);
  }
  return null;
}

function valueOf(totals: Totals, isAverage: boolean): number | null {
  if (isAverage) {
    return averageOf(totals);
  }
  return Number.isFinite(totals.amount) ? totals.amount : null;
}

function totalsOf<Point>(point: Point, measure: KpiMeasure<Point>): Totals {
  return { amount: measure.amount(point), per: measure.per?.(point) ?? 0 };
}

/** The previous period's totals summed into the current buckets they land in. */
function previousTotals<Point extends { date: string }>(
  points: readonly Point[],
  previousPoints: readonly Point[],
  measure: KpiMeasure<Point>,
  offsetDays: number,
): (Totals | null)[] {
  const slots: (Totals | null)[] = points.map(() => null);
  const indexes = previousBucketIndexes(points, previousPoints, offsetDays);
  for (const [position, point] of previousPoints.entries()) {
    const index = indexes[position];
    if (index === undefined) {
      continue;
    }
    const slot = slots[index] ?? { amount: 0, per: 0 };
    const totals = totalsOf(point, measure);
    slots[index] = { amount: slot.amount + totals.amount, per: slot.per + totals.per };
  }
  return slots;
}

/**
 * The buckets a tile draws: each current bucket's value beside the previous period's, laid over
 * the same stretch.
 *
 * @param offsetDays - How many days the previous period starts before this one: its length.
 */
export function buildKpiStory<Point extends { date: string }>(
  points: readonly Point[],
  previousPoints: readonly Point[] | null,
  measure: KpiMeasure<Point>,
  offsetDays: number,
): KpiStoryPoint[] {
  const isAverage = measure.per !== undefined;
  const previous =
    previousPoints === null ? null : previousTotals(points, previousPoints, measure, offsetDays);
  return points.map((point, index) => {
    const slot = previous?.[index] ?? null;
    return {
      date: point.date,
      value: valueOf(totalsOf(point, measure), isAverage),
      previous: slot === null ? null : valueOf(slot, isAverage),
    };
  });
}

/** Whether the chart has anything to draw: a value above zero now or in the period before. */
export function hasKpiData(story: readonly KpiStoryPoint[]): boolean {
  return story.some((point) => (point.value ?? 0) > 0 || (point.previous ?? 0) > 0);
}
