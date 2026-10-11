import { REVIEW_ASPECTS, type ReviewAspect } from "../schemas/reviews.ts";

/**
 * Supplier reputation, modelled on the marketplaces resellers already know:
 * - Mercado Livre: a five-colour thermometer over a rolling window, plus a leader badge;
 * - Amazon: star ratings split into positive (4–5), neutral (3) and negative (1–2), and
 *   operational metrics shown against a fixed target;
 * - Shopee: quick aspect tags on each review and a preferred-seller badge.
 */

/** Reviews and orders older than this no longer count, so a supplier can recover. */
export const SCORE_WINDOW_DAYS = 90;
/** Below this many reviews the supplier is shown as new, without a score. */
export const MIN_REVIEWS_FOR_SCORE = 10;
/** A delivered order can be reviewed (or the review edited) up to this many days after the sale. */
export const REVIEW_WINDOW_DAYS = 60;

/**
 * Bayesian prior: every supplier starts as if it had a few average reviews, so three
 * five-star reviews do not outrank three hundred reviews averaging 4.8.
 */
const PRIOR_RATING = 3.5;
const PRIOR_WEIGHT = 5;
/**
 * Order rates only cost points above their limit, like Amazon's account health targets:
 * every extra multiple of the limit costs this many points, up to the cap per metric. A
 * supplier inside its targets keeps exactly the score its stars give.
 */
const PENALTY_PER_LIMIT_MULTIPLE = 5;
const MAX_METRIC_PENALTY = 15;
/**
 * Order rates are smoothed: a supplier starts as if it had this many orders at half the
 * limit, so two cancellations in fifteen orders do not sink it.
 */
const PRIOR_ORDERS = 20;
/** Aspects mentioned fewer times than this are not shown as a percentage. */
const MIN_ASPECT_MENTIONS = 3;

const HIGHLIGHT = { minScore: 90, minOrders: 30, minAverage: 4.7 } as const;

export const SCORE_LEVELS = ["critical", "attention", "regular", "good", "excellent"] as const;
export type ScoreLevel = (typeof SCORE_LEVELS)[number];

export const SCORE_LEVEL_LABELS: Record<ScoreLevel, string> = {
  critical: "Crítico",
  attention: "Atenção",
  regular: "Regular",
  good: "Bom",
  excellent: "Excelente",
};

/** Lowest score of each level, from the best down. */
const LEVEL_FLOORS: readonly (readonly [ScoreLevel, number])[] = [
  ["excellent", 90],
  ["good", 75],
  ["regular", 60],
  ["attention", 40],
];

export const OPERATION_METRICS = ["returns", "cancellations"] as const;
export type OperationMetricKey = (typeof OPERATION_METRICS)[number];

export const OPERATION_METRIC_LABELS: Record<OperationMetricKey, string> = {
  returns: "Taxa de devolução",
  cancellations: "Taxa de cancelamento",
};

/** Highest acceptable rate of each metric, like Amazon's account health targets. */
export const OPERATION_METRIC_LIMITS: Record<OperationMetricKey, number> = {
  returns: 0.03,
  cancellations: 0.025,
};

export interface AspectCounts {
  good: number;
  bad: number;
}

/** Raw numbers of one supplier inside the score window, across every tenant. */
export interface SupplierReputationStats {
  reviewCount: number;
  ratingSum: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  aspects: Record<ReviewAspect, AspectCounts>;
  /** Orders with a final status (delivered, shipped, cancelled or returned). */
  orderCount: number;
  cancelledCount: number;
  returnedCount: number;
}

export interface AspectShare {
  aspect: ReviewAspect;
  /** Share of mentions that praise the aspect (0–1), or null with too few mentions. */
  share: number | null;
  mentions: number;
}

export interface OperationMetric {
  key: OperationMetricKey;
  /** Rate between 0 and 1, or null without finished orders. */
  rate: number | null;
  limit: number;
  withinLimit: boolean;
}

export interface Sentiment {
  positive: number;
  neutral: number;
  negative: number;
}

export interface SupplierReputation {
  /** 0–100, or null while the supplier has fewer than `MIN_REVIEWS_FOR_SCORE` reviews. */
  score: number | null;
  level: ScoreLevel | null;
  highlighted: boolean;
  /** Plain average of the stars (1–5), or null without reviews. */
  average: number | null;
  reviewCount: number;
  orderCount: number;
  /** Shares of positive, neutral and negative reviews, or null without reviews. */
  sentiment: Sentiment | null;
  aspects: AspectShare[];
  metrics: OperationMetric[];
}

export function emptyReputationStats(): SupplierReputationStats {
  return {
    reviewCount: 0,
    ratingSum: 0,
    positiveCount: 0,
    neutralCount: 0,
    negativeCount: 0,
    aspects: {
      dispatch: { good: 0, bad: 0 },
      conformity: { good: 0, bad: 0 },
      packaging: { good: 0, bad: 0 },
      support: { good: 0, bad: 0 },
    },
    orderCount: 0,
    cancelledCount: 0,
    returnedCount: 0,
  };
}

export function scoreLevel(score: number): ScoreLevel {
  const match = LEVEL_FLOORS.find(([, floor]) => score >= floor);
  if (!match) {
    return "critical";
  }
  return match[0];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Smoothed average mapped from 1–5 stars to 0–100 points. */
function reviewPoints(stats: SupplierReputationStats): number {
  const smoothed =
    (PRIOR_RATING * PRIOR_WEIGHT + stats.ratingSum) / (PRIOR_WEIGHT + stats.reviewCount);
  return ((smoothed - 1) / 4) * 100;
}

function metricRate(count: number, orderCount: number): number | null {
  if (orderCount === 0) {
    return null;
  }
  return count / orderCount;
}

function metricCounts(stats: SupplierReputationStats): Record<OperationMetricKey, number> {
  return { returns: stats.returnedCount, cancellations: stats.cancelledCount };
}

function buildMetrics(stats: SupplierReputationStats): OperationMetric[] {
  const counts = metricCounts(stats);
  return OPERATION_METRICS.map((key) => {
    const rate = metricRate(counts[key], stats.orderCount);
    const limit = OPERATION_METRIC_LIMITS[key];
    return { key, rate, limit, withinLimit: rate === null || rate <= limit };
  });
}

/** Points one metric takes off, from its smoothed rate; the raw rate is what the UI shows. */
function metricPenalty(count: number, orderCount: number, limit: number): number {
  const smoothed = (count + (PRIOR_ORDERS * limit) / 2) / (orderCount + PRIOR_ORDERS);
  const excessMultiples = (smoothed - limit) / limit;
  return clamp(excessMultiples * PENALTY_PER_LIMIT_MULTIPLE, 0, MAX_METRIC_PENALTY);
}

function operationPenalty(stats: SupplierReputationStats): number {
  if (stats.orderCount === 0) {
    return 0;
  }
  const counts = metricCounts(stats);
  return OPERATION_METRICS.reduce(
    (sum, key) => sum + metricPenalty(counts[key], stats.orderCount, OPERATION_METRIC_LIMITS[key]),
    0,
  );
}

function buildAspects(stats: SupplierReputationStats): AspectShare[] {
  return REVIEW_ASPECTS.map((aspect) => {
    const counts = stats.aspects[aspect];
    const mentions = counts.good + counts.bad;
    const share = mentions >= MIN_ASPECT_MENTIONS ? counts.good / mentions : null;
    return { aspect, share, mentions };
  });
}

function buildSentiment(stats: SupplierReputationStats): Sentiment | null {
  if (stats.reviewCount === 0) {
    return null;
  }
  return {
    positive: stats.positiveCount / stats.reviewCount,
    neutral: stats.neutralCount / stats.reviewCount,
    negative: stats.negativeCount / stats.reviewCount,
  };
}

/**
 * The stars set the score, so the level always agrees with the average the reseller sees;
 * returns and cancellations above their limits can only pull it down.
 */
function computeScore(stats: SupplierReputationStats): number | null {
  if (stats.reviewCount < MIN_REVIEWS_FOR_SCORE) {
    return null;
  }
  return Math.round(clamp(reviewPoints(stats) - operationPenalty(stats), 0, 100));
}

export function computeSupplierReputation(stats: SupplierReputationStats): SupplierReputation {
  const metrics = buildMetrics(stats);
  const score = computeScore(stats);
  const average = stats.reviewCount === 0 ? null : stats.ratingSum / stats.reviewCount;
  const highlighted =
    score !== null &&
    average !== null &&
    score >= HIGHLIGHT.minScore &&
    average >= HIGHLIGHT.minAverage &&
    stats.orderCount >= HIGHLIGHT.minOrders &&
    metrics.every((metric) => metric.withinLimit);
  return {
    score,
    level: score === null ? null : scoreLevel(score),
    highlighted,
    average,
    reviewCount: stats.reviewCount,
    orderCount: stats.orderCount,
    sentiment: buildSentiment(stats),
    aspects: buildAspects(stats),
    metrics,
  };
}

/** Whether a reseller may still review (or edit the review of) an order. */
export function canReviewOrder(
  order: { status: string; orderedAt: Date },
  now: Date = new Date(),
): boolean {
  if (order.status !== "delivered") {
    return false;
  }
  const ageDays = (now.getTime() - order.orderedAt.getTime()) / 86_400_000;
  return ageDays <= REVIEW_WINDOW_DAYS;
}

/** Best first; suppliers without a score go last, ordered by their review count. */
export function compareReputation(first: SupplierReputation, second: SupplierReputation): number {
  if (first.score !== second.score) {
    return (second.score ?? -1) - (first.score ?? -1);
  }
  return second.reviewCount - first.reviewCount;
}
