import { DAY_MILLISECONDS } from "./time.ts";
import {
  acceptOutcome,
  dispatchOutcome,
  tallyAccept,
  tallyCancellations,
  tallyDispatch,
  tallyRatings,
  type ReviewHealthRecord,
  type ShipmentHealthRecord,
} from "./supplier-panel-health-outcomes.ts";
import {
  healthForecast,
  metricValue,
  type HealthForecast,
  type MetricTally,
} from "./supplier-panel-health-forecast.ts";
import {
  HEALTH_LEVEL_RANK,
  HEALTH_METRIC_DEFINITIONS,
  HEALTH_METRICS,
  HEALTH_WINDOW_DAYS,
  levelOfValue,
  type HealthLevel,
  type HealthMetricDefinition,
  type HealthMetricKey,
} from "./supplier-panel-health-metrics.ts";

export * from "./supplier-panel-health-metrics.ts";
export * from "./supplier-panel-health-forecast.ts";
export * from "./supplier-panel-health-outcomes.ts";

/**
 * The supplier's health thermometer over the last `HEALTH_WINDOW_DAYS`, from its parcels and
 * the resellers' reviews. Pure: the repository reads two windows of records and this module
 * does every count, so the drill-down lists exactly the orders the numbers came from.
 */

/** A change smaller than this (half a point, or 0,05 star) reads as stable. */
const RATE_TREND_TOLERANCE = 0.005;
const STARS_TREND_TOLERANCE = 0.05;

export type HealthTrend = "better" | "worse" | "flat";

export interface HealthMetric {
  key: HealthMetricKey;
  definition: HealthMetricDefinition;
  /** Share (0–1) or stars (1–5); null without any counted order or review. */
  value: number | null;
  /** Orders (or reviews) that counted; below `definition.minSample` the level is insufficient. */
  sample: number;
  level: HealthLevel;
  previousValue: number | null;
  /** Against the previous window; null when either window is too small to compare. */
  trend: HealthTrend | null;
  forecast: HealthForecast;
}

export interface SupplierHealth {
  windowDays: number;
  /** Worst measured metric; insufficient only when no metric has enough data. */
  level: HealthLevel;
  metrics: HealthMetric[];
}

export interface HealthInput {
  shipments: readonly ShipmentHealthRecord[];
  reviews: readonly ReviewHealthRecord[];
  now: Date;
}

interface HealthWindow {
  from: Date;
  /** Exclusive end; null for the current window, which takes everything up to now. */
  to: Date | null;
}

/**
 * The current window has no end: a row the database stamped a moment after the app's clock
 * (the two clocks drift) still counts. The previous one ends where the current one starts.
 */
export function healthWindows(now: Date): { current: HealthWindow; previous: HealthWindow } {
  const span = HEALTH_WINDOW_DAYS * DAY_MILLISECONDS;
  const currentFrom = new Date(now.getTime() - span);
  return {
    current: { from: currentFrom, to: null },
    previous: { from: new Date(currentFrom.getTime() - span), to: currentFrom },
  };
}

function inWindow(date: Date | null, window: HealthWindow): boolean {
  if (date === null || date.getTime() < window.from.getTime()) {
    return false;
  }
  return window.to === null || date.getTime() < window.to.getTime();
}

/** Parcels count in the window of their latest forward, reviews in the window they were left. */
function recordsIn(input: HealthInput, window: HealthWindow) {
  return {
    shipments: input.shipments.filter((record) => inWindow(record.forwardedAt, window)),
    reviews: input.reviews.filter((review) => inWindow(review.createdAt, window)),
  };
}

function tallyFor(
  key: HealthMetricKey,
  records: ReturnType<typeof recordsIn>,
  now: Date,
): MetricTally {
  if (key === "accept_on_time") {
    return tallyAccept(records.shipments, now);
  }
  if (key === "dispatch_on_time") {
    return tallyDispatch(records.shipments, now);
  }
  if (key === "supplier_cancellations") {
    return tallyCancellations(records.shipments);
  }
  const ratings = tallyRatings(records.reviews);
  return { good: ratings.sum, counted: ratings.count };
}

/** Value of a window, or null when it is below the minimum sample. */
function measuredValue(definition: HealthMetricDefinition, tally: MetricTally): number | null {
  if (tally.counted < definition.minSample) {
    return null;
  }
  return metricValue(definition, tally);
}

function trendOf(
  definition: HealthMetricDefinition,
  current: number | null,
  previous: number | null,
): HealthTrend | null {
  if (current === null || previous === null) {
    return null;
  }
  const tolerance = definition.unit === "stars" ? STARS_TREND_TOLERANCE : RATE_TREND_TOLERANCE;
  const gain =
    definition.direction === "higher_is_better" ? current - previous : previous - current;
  if (Math.abs(gain) < tolerance) {
    return "flat";
  }
  return gain > 0 ? "better" : "worse";
}

function buildMetric(
  key: HealthMetricKey,
  tallies: { current: MetricTally; previous: MetricTally },
): HealthMetric {
  const definition = HEALTH_METRIC_DEFINITIONS[key];
  const measured = measuredValue(definition, tallies.current);
  const level = measured === null ? "insufficient" : levelOfValue(definition, measured);
  const previousValue = measuredValue(definition, tallies.previous);
  return {
    key,
    definition,
    value: metricValue(definition, tallies.current),
    sample: tallies.current.counted,
    level,
    previousValue,
    trend: trendOf(definition, measured, previousValue),
    forecast: healthForecast(definition, tallies.current, level),
  };
}

function overallLevel(metrics: readonly HealthMetric[]): HealthLevel {
  const ranked = metrics
    .map((metric) => metric.level)
    .toSorted((first, second) => HEALTH_LEVEL_RANK[first] - HEALTH_LEVEL_RANK[second]);
  return ranked[0] ?? "insufficient";
}

export function computeSupplierHealth(input: HealthInput): SupplierHealth {
  const windows = healthWindows(input.now);
  const current = recordsIn(input, windows.current);
  const previous = recordsIn(input, windows.previous);
  const metrics = HEALTH_METRICS.map((key) =>
    buildMetric(key, {
      current: tallyFor(key, current, input.now),
      previous: tallyFor(key, previous, input.now),
    }),
  );
  return { windowDays: HEALTH_WINDOW_DAYS, level: overallLevel(metrics), metrics };
}

/** One order behind a metric, as the drill-down lists it. */
export interface HealthDrillDownRow {
  orderId: string;
  externalOrderId: string;
  /** When it happened: the forward of a parcel, or the date of a review. */
  at: Date;
  /** Stars of a review; null for parcels. */
  rating: number | null;
}

/** A review at or below this many stars is what pulls the average down. */
const LOW_RATING = 3;

function shipmentRow(record: ShipmentHealthRecord): HealthDrillDownRow {
  return {
    orderId: record.orderId,
    externalOrderId: record.externalOrderId,
    at: record.forwardedAt ?? new Date(0),
    rating: null,
  };
}

function isAgainst(key: HealthMetricKey, record: ShipmentHealthRecord, now: Date): boolean {
  if (key === "accept_on_time") {
    return acceptOutcome(record, now) === "late";
  }
  if (key === "dispatch_on_time") {
    return dispatchOutcome(record, now) === "late";
  }
  return record.cancelledBySupplier;
}

/** The orders of the current window that count against a metric, newest first. */
export function healthDrillDown(key: HealthMetricKey, input: HealthInput): HealthDrillDownRow[] {
  const current = recordsIn(input, healthWindows(input.now).current);
  const rows =
    key === "average_rating"
      ? current.reviews
          .filter((review) => review.rating <= LOW_RATING)
          .map((review) => ({
            orderId: review.orderId,
            externalOrderId: review.externalOrderId,
            at: review.createdAt,
            rating: review.rating,
          }))
      : current.shipments.filter((record) => isAgainst(key, record, input.now)).map(shipmentRow);
  return rows.toSorted((first, second) => second.at.getTime() - first.at.getTime());
}
