import { useCallback, useSyncExternalStore } from "react";
import type { MetricPoint } from "./dashboard-metrics";

export const CHART_KINDS = ["area", "bars", "waterfall", "margin", "cumulative"] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

/** The chart every account sees until its owner picks another one as default. */
export const FACTORY_CHART_KIND: ChartKind = "area";

const STORAGE_KEY = "sellbridge-dashboard-chart";
const CHART_EVENT = "sellbridge-dashboard-chart-change";

function isChartKind(value: unknown): value is ChartKind {
  return CHART_KINDS.some((kind) => kind === value);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHART_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHART_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): ChartKind {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isChartKind(saved) ? saved : FACTORY_CHART_KIND;
  } catch {
    // Storage may be unavailable (private mode); the dashboard opens with the factory chart.
    return FACTORY_CHART_KIND;
  }
}

function getServerSnapshot(): ChartKind {
  return FACTORY_CHART_KIND;
}

function writeDefault(kind: ChartKind): void {
  if (kind === FACTORY_CHART_KIND) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, kind);
}

function saveDefault(kind: ChartKind): void {
  try {
    writeDefault(kind);
  } catch {
    // Storage may be unavailable (private mode); the choice still applies to this page.
  }
  window.dispatchEvent(new Event(CHART_EVENT));
}

/** The chart the dashboard opens with: the factory one, or the one this browser saved. */
export function useDefaultChartKind(): {
  defaultKind: ChartKind;
  setDefaultKind: (kind: ChartKind) => void;
} {
  const defaultKind = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setDefaultKind = useCallback((kind: ChartKind) => saveDefault(kind), []);
  return { defaultKind, setDefaultKind };
}

export interface ChartPoint {
  date: string;
  revenue: number;
  profit: number;
  /** What did not stay as profit: product cost, fees and refunds. */
  cost: number;
  /** Profit over revenue, in percent; null when nothing was sold. */
  margin: number | null;
  /** The same stretch of the previous period, for the comparison line; null without one. */
  previousRevenue: number | null;
  previousProfit: number | null;
  /** Trailing average of the last buckets, the trend under the daily noise; null when cumulative. */
  averageRevenue: number | null;
  averageProfit: number | null;
  /** The previous period's trailing average, so both lines are smoothed alike. */
  previousAverageRevenue: number | null;
  previousAverageProfit: number | null;
}

/** How many buckets the moving average spans (a week of days). */
export const AVERAGE_WINDOW = 7;

function marginOf(revenue: number, profit: number): number | null {
  if (revenue <= 0) {
    return null;
  }
  return Math.round((profit / revenue) * 1000) / 10;
}

function runningTotals(points: readonly MetricPoint[]): MetricPoint[] {
  let orders = 0;
  let revenueCents = 0;
  let profitCents = 0;
  return points.map((point) => {
    orders += point.orders;
    revenueCents += point.revenueCents;
    profitCents += point.profitCents;
    return { date: point.date, orders, revenueCents, profitCents };
  });
}

/** Mean of the last `AVERAGE_WINDOW` values up to `index`; shorter at the start of the period. */
function trailingAverage(values: readonly number[], index: number): number {
  const recentValues = values.slice(Math.max(0, index - AVERAGE_WINDOW + 1), index + 1);
  return Math.round(recentValues.reduce((sum, value) => sum + value, 0) / recentValues.length);
}

/** Trailing average over the buckets that have a value; null where this bucket has none. */
function trailingAverageOf(values: readonly (number | null)[], index: number): number | null {
  if (values[index] === null) {
    return null;
  }
  const recentValues = values
    .slice(Math.max(0, index - AVERAGE_WINDOW + 1), index + 1)
    .filter((value): value is number => value !== null);
  return Math.round(recentValues.reduce((sum, value) => sum + value, 0) / recentValues.length);
}

const DAY_MILLISECONDS = 86_400_000;

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Index of the bucket holding `isoDate`: the last one starting on or before it, or the first. */
function bucketIndexOf(buckets: readonly MetricPoint[], isoDate: string): number {
  return Math.max(
    0,
    buckets.findLastIndex((bucket) => bucket.date <= isoDate),
  );
}

interface AlignedTotals {
  revenueCents: number;
  profitCents: number;
}

/** Days one bucket spans (1 for days, 7 for weeks), read from the gap between the first two. */
function bucketSpanDays(buckets: readonly MetricPoint[]): number {
  const [first, second] = buckets;
  if (!first || !second) {
    return 1;
  }
  const milliseconds = Date.parse(second.date) - Date.parse(first.date);
  return Math.max(1, Math.round(milliseconds / DAY_MILLISECONDS));
}

/**
 * The previous period laid over the current buckets. Each previous bucket moves forward by the
 * period's length and lands in the current bucket that holds its middle day, the one it overlaps
 * most. A weekly series thus stays in step even when the two periods start on different weekdays
 * (a partial first week, one week more or less) instead of being paired by position. Buckets
 * landing together add up; a current bucket nothing lands in has no value.
 */
function alignPrevious(
  current: readonly MetricPoint[],
  previous: readonly MetricPoint[],
  offsetDays: number,
): (AlignedTotals | null)[] {
  const aligned: (AlignedTotals | null)[] = current.map(() => null);
  if (current.length === 0) {
    return aligned;
  }
  const middleDays = Math.floor((bucketSpanDays(current) - 1) / 2);
  for (const point of previous) {
    const index = bucketIndexOf(current, addDays(point.date, offsetDays + middleDays));
    const slot = aligned[index] ?? { revenueCents: 0, profitCents: 0 };
    aligned[index] = {
      revenueCents: slot.revenueCents + point.revenueCents,
      profitCents: slot.profitCents + point.profitCents,
    };
  }
  return aligned;
}

/** Running totals that skip the buckets without a value (they stay empty). */
function runningAlignedTotals(
  aligned: readonly (AlignedTotals | null)[],
): (AlignedTotals | null)[] {
  let revenueCents = 0;
  let profitCents = 0;
  return aligned.map((slot) => {
    if (slot === null) {
      return null;
    }
    revenueCents += slot.revenueCents;
    profitCents += slot.profitCents;
    return { revenueCents, profitCents };
  });
}

export interface PreviousSeries {
  points: readonly MetricPoint[];
  /** How many days the previous period starts before the current one: the period's length. */
  offsetDays: number;
}

/**
 * Points the charts draw. `previous` is matched by date, shifted by the period's length, so its
 * line sits under the same stretch of the current period; `cumulative` turns both into running
 * totals.
 */
export function buildChartPoints(
  points: readonly MetricPoint[],
  {
    previous = null,
    cumulative = false,
  }: { previous?: PreviousSeries | null; cumulative?: boolean } = {},
): ChartPoint[] {
  const current = cumulative ? runningTotals(points) : points;
  const aligned = previous ? alignPrevious(points, previous.points, previous.offsetDays) : null;
  const before = aligned && cumulative ? runningAlignedTotals(aligned) : aligned;
  const revenues = current.map((point) => point.revenueCents);
  const profits = current.map((point) => point.profitCents);
  const previousRevenues = before?.map((slot) => slot?.revenueCents ?? null) ?? [];
  const previousProfits = before?.map((slot) => slot?.profitCents ?? null) ?? [];
  return current.map((point, index) => {
    const previousPoint = before?.[index] ?? null;
    return {
      date: point.date,
      revenue: point.revenueCents,
      profit: point.profitCents,
      cost: point.revenueCents - point.profitCents,
      margin: marginOf(point.revenueCents, point.profitCents),
      previousRevenue: previousPoint ? previousPoint.revenueCents : null,
      previousProfit: previousPoint ? previousPoint.profitCents : null,
      averageRevenue: cumulative ? null : trailingAverage(revenues, index),
      averageProfit: cumulative ? null : trailingAverage(profits, index),
      previousAverageRevenue:
        previousPoint && !cumulative ? trailingAverageOf(previousRevenues, index) : null,
      previousAverageProfit:
        previousPoint && !cumulative ? trailingAverageOf(previousProfits, index) : null,
    };
  });
}

function mondayOf(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

/**
 * Daily points summed into weeks starting on Monday. Each week is dated by its first day in the
 * period, so a partial first week reads "11 de set." rather than a Monday before the period.
 */
export function groupByWeek(points: readonly MetricPoint[]): MetricPoint[] {
  const weeks = new Map<string, MetricPoint>();
  for (const point of points) {
    const key = mondayOf(point.date);
    const week = weeks.get(key) ?? { date: point.date, orders: 0, revenueCents: 0, profitCents: 0 };
    weeks.set(key, {
      date: week.date,
      orders: week.orders + point.orders,
      revenueCents: week.revenueCents + point.revenueCents,
      profitCents: week.profitCents + point.profitCents,
    });
  }
  return [...weeks.values()];
}

/** Margin of the whole period, weighted by revenue (not an average of daily margins). */
export function periodMargin(points: readonly MetricPoint[]): number | null {
  const revenue = points.reduce((sum, point) => sum + point.revenueCents, 0);
  const profit = points.reduce((sum, point) => sum + point.profitCents, 0);
  return marginOf(revenue, profit);
}

export function hasSales(points: readonly MetricPoint[]): boolean {
  return points.some((point) => point.revenueCents !== 0 || point.profitCents !== 0);
}

const NICE_STEPS = [1, 2, 2.5, 4, 5, 10];

function stepFor(span: number, ticks: number): number {
  const raw = span / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const factor = NICE_STEPS.find((step) => step * magnitude >= raw) ?? 10;
  return factor * magnitude;
}

/**
 * The round step whose last tick sits closest above the top value, so little height is wasted;
 * on a tie, the one with fewer ticks.
 */
function niceStep(span: number, targetTicks: number): number {
  const candidates = [targetTicks, targetTicks + 1, targetTicks + 2].map((ticks) =>
    stepFor(span, ticks),
  );
  const topOf = (step: number) => Math.ceil(span / step) * step;
  return candidates.reduce((best, step) => (topOf(step) < topOf(best) ? step : best));
}

/** Share of a step kept free beyond the extreme values, so no line touches the frame. */
const HEADROOM = 0.2;

/**
 * Round ticks that frame every value with room to spare: nothing the chart draws may touch or
 * cross the edge of the plot. Above the largest value there is always some headroom; a dip below
 * zero gets its own labeled tick (half a step when the dip is small), so a loss reads as data
 * inside the chart, never as a line escaping under its floor.
 */
export function niceScale(
  values: readonly number[],
  targetTicks = 3,
): { domain: [number, number]; ticks: number[] } {
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max > 0 ? max : -min;
  if (span === 0) {
    return { domain: [0, 1], ticks: [0] };
  }
  const step = niceStep(span, targetTicks);
  const topTick = Math.ceil(max / step) * step;
  const negativeStep = -min <= step / 2 ? step / 2 : step;
  const bottomTick = min < 0 ? -Math.ceil(-min / negativeStep) * negativeStep : 0;
  const ticks: number[] = [];
  for (let tick = bottomTick; tick < 0; tick += negativeStep) {
    ticks.push(Math.round(tick * 1000) / 1000);
  }
  for (let tick = 0; tick <= topTick + step / 1000; tick += step) {
    ticks.push(Math.round(tick * 1000) / 1000);
  }
  const roomAbove = topTick - max < step * HEADROOM ? step * HEADROOM : 0;
  const roomBelow =
    min < 0 && min - bottomTick < negativeStep * HEADROOM ? negativeStep * HEADROOM : 0;
  return { domain: [bottomTick - roomBelow, topTick + roomAbove], ticks };
}

export interface FlowSummary {
  revenueCents: number;
  costCents: number;
  feeCents: number;
  platformFeeCents: number;
  refundCents: number;
  commissionCents: number;
  profitCents: number;
}

export type WaterfallTone = "revenue" | "cost" | "fee" | "refund" | "gain" | "profit";

export interface WaterfallStep {
  key: WaterfallTone;
  label: string;
  /** Signed amount: negative leaves the revenue, positive adds to it. */
  cents: number;
  /** Where the bar starts and ends on the axis. */
  range: [number, number];
}

/**
 * Revenue down to profit, one bar per deduction: the same lines as the financial page, so both
 * screens tell the same arithmetic. Steps worth zero are left out.
 */
export function buildWaterfall(summary: FlowSummary): WaterfallStep[] {
  const moves: { key: WaterfallTone; label: string; cents: number }[] = [
    { key: "cost", label: "Custo dos produtos", cents: -summary.costCents },
    {
      key: "fee",
      label: "Taxas do marketplace",
      cents: -(summary.feeCents + summary.platformFeeCents),
    },
    { key: "refund", label: "Reembolsos", cents: -summary.refundCents },
    { key: "gain", label: "Comissões recebidas", cents: summary.commissionCents },
  ];
  const steps: WaterfallStep[] = [
    {
      key: "revenue",
      label: "Receita",
      cents: summary.revenueCents,
      range: [0, summary.revenueCents],
    },
  ];
  let level = summary.revenueCents;
  for (const move of moves.filter((candidate) => candidate.cents !== 0)) {
    const next = level + move.cents;
    steps.push({ ...move, range: [Math.min(level, next), Math.max(level, next)] });
    level = next;
  }
  steps.push({
    key: "profit",
    label: "Lucro",
    cents: summary.profitCents,
    range: [Math.min(0, summary.profitCents), Math.max(0, summary.profitCents)],
  });
  return steps;
}
