import { MIN_REVIEWS_FOR_SCORE, OPERATION_METRIC_LIMITS, scoreLevel } from "./supplier-score.ts";

/**
 * The four numbers of the supplier's health thermometer, each with the line it must stay on
 * the right side of. Modelled on Amazon's account health and Mercado Livre's thermometer:
 * green is inside the target, yellow is a warning band, red is where resellers feel it.
 */

/** Rolling window of the thermometer; the trend compares it with the window right before. */
export const HEALTH_WINDOW_DAYS = 60;

/**
 * Below this many counted orders a rate says more about luck than about the supplier (two
 * late parcels out of five read as 60%), so the metric shows "ainda sem dados suficientes"
 * instead of a scary red.
 */
export const MIN_HEALTH_ORDERS = 10;

/** Accepted within the supplier's accept time: green from 95%, red below 85%. */
export const ACCEPT_ON_TIME_TARGET = 0.95;
export const ACCEPT_ON_TIME_FLOOR = 0.85;

/** Dispatched before the dispatch deadline: green from 90%, red below 80%. */
export const DISPATCH_ON_TIME_TARGET = 0.9;
export const DISPATCH_ON_TIME_FLOOR = 0.8;

/**
 * Parcels the supplier cancelled itself: green up to 2%. Red starts where the public score
 * resellers see (`supplier-score.ts`) starts losing points, so both screens agree.
 */
export const SUPPLIER_CANCELLATION_TARGET = 0.02;
export const SUPPLIER_CANCELLATION_LIMIT = OPERATION_METRIC_LIMITS.cancellations;

export const HEALTH_METRICS = [
  "accept_on_time",
  "dispatch_on_time",
  "supplier_cancellations",
  "average_rating",
] as const;
export type HealthMetricKey = (typeof HEALTH_METRICS)[number];

export const HEALTH_METRIC_LABELS: Record<HealthMetricKey, string> = {
  accept_on_time: "Aceite no prazo",
  dispatch_on_time: "Despacho no prazo",
  supplier_cancellations: "Cancelamentos por você",
  average_rating: "Nota média",
};

export const HEALTH_LEVELS = ["green", "yellow", "red", "insufficient"] as const;
export type HealthLevel = (typeof HEALTH_LEVELS)[number];

export const HEALTH_LEVEL_LABELS: Record<HealthLevel, string> = {
  green: "Verde",
  yellow: "Amarelo",
  red: "Vermelho",
  insufficient: "Sem dados suficientes",
};

/** Worst first, for the overall level and the attention queue. */
export const HEALTH_LEVEL_RANK: Record<HealthLevel, number> = {
  red: 0,
  yellow: 1,
  green: 2,
  insufficient: 3,
};

export type MetricDirection = "higher_is_better" | "lower_is_better";

export interface HealthMetricDefinition {
  key: HealthMetricKey;
  direction: MetricDirection;
  /** Green on the good side of this value, the value itself included. */
  target: number;
  /** Red past this value; between the two is yellow. */
  floor: number;
  minSample: number;
  /** "rate" metrics are shares (0–1); "stars" is the 1–5 average. */
  unit: "rate" | "stars";
}

/** Hundredths of a star from 1,00 to 5,00, so the search below works on exact integers. */
const LOWEST_HUNDREDTHS = 100;
const HIGHEST_HUNDREDTHS = 500;

/**
 * Lowest average (in hundredths) whose public score reaches one of the levels: the rating
 * lines come from `supplier-score.ts` rather than being typed twice. The score maps 1–5 stars
 * to 0–100 points, which is a quarter point per hundredth of a star.
 */
function lowestAverageAt(levels: readonly string[]): number {
  const steps = Array.from(
    { length: HIGHEST_HUNDREDTHS - LOWEST_HUNDREDTHS + 1 },
    (_, index) => LOWEST_HUNDREDTHS + index,
  );
  const found = steps.find((hundredths) =>
    levels.includes(scoreLevel((hundredths - LOWEST_HUNDREDTHS) / 4)),
  );
  return (found ?? HIGHEST_HUNDREDTHS) / 100;
}

/** Green from the average that gives a "Bom" public score (4,0), red below "Regular" (3,4). */
export const RATING_TARGET = lowestAverageAt(["good", "excellent"]);
export const RATING_FLOOR = lowestAverageAt(["regular", "good", "excellent"]);

export const HEALTH_METRIC_DEFINITIONS: Record<HealthMetricKey, HealthMetricDefinition> = {
  accept_on_time: {
    key: "accept_on_time",
    direction: "higher_is_better",
    target: ACCEPT_ON_TIME_TARGET,
    floor: ACCEPT_ON_TIME_FLOOR,
    minSample: MIN_HEALTH_ORDERS,
    unit: "rate",
  },
  dispatch_on_time: {
    key: "dispatch_on_time",
    direction: "higher_is_better",
    target: DISPATCH_ON_TIME_TARGET,
    floor: DISPATCH_ON_TIME_FLOOR,
    minSample: MIN_HEALTH_ORDERS,
    unit: "rate",
  },
  supplier_cancellations: {
    key: "supplier_cancellations",
    direction: "lower_is_better",
    target: SUPPLIER_CANCELLATION_TARGET,
    floor: SUPPLIER_CANCELLATION_LIMIT,
    minSample: MIN_HEALTH_ORDERS,
    unit: "rate",
  },
  average_rating: {
    key: "average_rating",
    direction: "higher_is_better",
    target: RATING_TARGET,
    floor: RATING_FLOOR,
    minSample: MIN_REVIEWS_FOR_SCORE,
    unit: "stars",
  },
};

/** Level of a measured value; the sample rule is applied by the caller. */
export function levelOfValue(definition: HealthMetricDefinition, value: number): HealthLevel {
  if (definition.direction === "higher_is_better") {
    if (value >= definition.target) {
      return "green";
    }
    return value >= definition.floor ? "yellow" : "red";
  }
  if (value <= definition.target) {
    return "green";
  }
  return value <= definition.floor ? "yellow" : "red";
}
