import { MINIMUM_RESOLVED_TO_COMPARE, minutesBetween, noReopenOf } from "./rules.ts";
import { lateFirstResponse, onTimeOf, ratingRate } from "./team.ts";
import type {
  HealthDrillItem,
  HealthLevel,
  HealthMetricKey,
  OpenedTicketRow,
  QueueRow,
  Rate,
  RatingRow,
  ResolutionRow,
  SupportHealth,
  SupportHealthMetric,
} from "./types.ts";

/*
 * The support's health, in the shape of the supplier's Desempenho: every metric against a
 * target, the worst level on top, and the tickets behind each metric so no number is a mystery.
 */

/** What the coordination aims for; the screen shows "meta" beside every figure. */
export const SUPPORT_TARGETS: Readonly<Record<HealthMetricKey, number>> = {
  on_time: 0.9,
  overdue_now: 2,
  no_reopen: 0.9,
  rating: 4.5,
};

/** A figure this close below its target reads "Atenção" instead of "Fora da meta". */
export const TARGET_WARNING_MARGIN = { on_time: 0.05, no_reopen: 0.05, rating: 0.2 } as const;

/** Tickets listed under the chosen metric; the rest open in the queue. */
export const DRILL_DOWN_SHOWN = 3;

const BEST_RATING = 5;
const LOW_RATING_MAX = 3;

const LEVEL_SEVERITY: Readonly<Record<HealthLevel, number>> = {
  off_target: 0,
  warning: 1,
  on_target: 2,
  insufficient: 3,
};

/** Where a share or an average stands: higher is better, with a warning band below the target. */
export function levelAgainstTarget(rate: Rate, target: number, margin: number): HealthLevel {
  if (rate.value === null || rate.sample < MINIMUM_RESOLVED_TO_COMPARE) {
    return "insufficient";
  }
  if (rate.value >= target) {
    return "on_target";
  }
  return rate.value >= target - margin ? "warning" : "off_target";
}

// Six decimals absorb float noise, so 0.84 of 100 against 0.9 asks for 60, not 61.
function ceilClean(value: number): number {
  return Math.ceil(Number(value.toFixed(6)));
}

/** How many more passing items lift a share to its target: (passes + k) / (sample + k) ≥ target. */
export function itemsToReachShare(rate: Rate, target: number): number | null {
  if (rate.value === null || rate.value >= target || target >= 1) {
    return null;
  }
  const passes = rate.value * rate.sample;
  return ceilClean((target * rate.sample - passes) / (1 - target));
}

/** How many more best ratings lift an average to its target. */
export function ratingsToReachAverage(rate: Rate, target: number): number | null {
  if (rate.value === null || rate.value >= target) {
    return null;
  }
  return ceilClean(((target - rate.value) * rate.sample) / (BEST_RATING - target));
}

function newestFirst<Row>(rows: readonly Row[], dateOf: (row: Row) => Date): Row[] {
  return rows.toSorted((first, second) => dateOf(second).getTime() - dateOf(first).getTime());
}

interface Periods<Row> {
  current: readonly Row[];
  previous: readonly Row[];
}

function onTimeMetric(opened: Periods<OpenedTicketRow>, now: Date): SupportHealthMetric {
  const rate = onTimeOf(opened.current, now);
  const target = SUPPORT_TARGETS.on_time;
  const late = newestFirst(
    opened.current.filter((row) => lateFirstResponse(row, now)),
    (row) => row.createdAt,
  );
  return {
    key: "on_time",
    level: levelAgainstTarget(rate, target, TARGET_WARNING_MARGIN.on_time),
    current: rate.value,
    previous: onTimeOf(opened.previous, now).value,
    sample: rate.sample,
    target,
    toTarget: itemsToReachShare(rate, target),
    drillDownTotal: late.length,
    drillDown: late.slice(0, DRILL_DOWN_SHOWN).map((row): HealthDrillItem => ({
      ticketId: row.ticketId,
      origin: row.origin,
      category: row.category,
      situationId: row.situationId,
      agentId: row.firstResponderId,
      at: row.createdAt.toISOString(),
      detail:
        row.firstResponseAt === null
          ? { kind: "unanswered" }
          : {
              kind: "answered_late",
              responseMinutes: minutesBetween(row.createdAt, row.firstResponseAt),
            },
    })),
  };
}

function overdueMetric(queue: readonly QueueRow[], now: Date): SupportHealthMetric {
  const target = SUPPORT_TARGETS.overdue_now;
  // The longest wait first: that is the one to answer now.
  const overdue = queue
    .filter((row) => row.overdue)
    .toSorted(
      (first, second) =>
        (first.awaitingSince?.getTime() ?? now.getTime()) -
        (second.awaitingSince?.getTime() ?? now.getTime()),
    );
  return {
    key: "overdue_now",
    level: overdue.length <= target ? "on_target" : "off_target",
    current: overdue.length,
    previous: null,
    sample: queue.length,
    target,
    toTarget: overdue.length <= target ? null : overdue.length - target,
    drillDownTotal: overdue.length,
    drillDown: overdue.slice(0, DRILL_DOWN_SHOWN).map((row) => ({
      ticketId: row.ticketId,
      origin: row.origin,
      category: row.category,
      situationId: row.situationId,
      agentId: row.assigneeId,
      at: (row.awaitingSince ?? now).toISOString(),
      detail: {
        kind: "waiting",
        minutes: row.awaitingSince === null ? 0 : minutesBetween(row.awaitingSince, now),
      },
    })),
  };
}

function noReopenMetric(resolutions: Periods<ResolutionRow>, now: Date): SupportHealthMetric {
  const rate = noReopenOf(resolutions.current, now);
  const target = SUPPORT_TARGETS.no_reopen;
  const cameBack = newestFirst(
    resolutions.current.filter((row) => row.cameBack),
    (row) => row.closedAt,
  );
  return {
    key: "no_reopen",
    level: levelAgainstTarget(rate, target, TARGET_WARNING_MARGIN.no_reopen),
    current: rate.value,
    previous: noReopenOf(resolutions.previous, now).value,
    sample: rate.sample,
    target,
    toTarget: itemsToReachShare(rate, target),
    drillDownTotal: cameBack.length,
    drillDown: cameBack.slice(0, DRILL_DOWN_SHOWN).map((row) => ({
      ticketId: row.ticketId,
      origin: row.origin,
      category: row.category,
      situationId: row.situationId,
      agentId: row.resolverId,
      at: row.closedAt.toISOString(),
      detail: { kind: "came_back" },
    })),
  };
}

function ratingMetric(ratings: Periods<RatingRow>): SupportHealthMetric {
  const rate = ratingRate(ratings.current);
  const target = SUPPORT_TARGETS.rating;
  const low = newestFirst(
    ratings.current.filter((row) => row.rating <= LOW_RATING_MAX),
    (row) => row.ratedAt,
  );
  return {
    key: "rating",
    level: levelAgainstTarget(rate, target, TARGET_WARNING_MARGIN.rating),
    current: rate.value,
    previous: ratingRate(ratings.previous).value,
    sample: rate.sample,
    target,
    toTarget: ratingsToReachAverage(rate, target),
    drillDownTotal: low.length,
    drillDown: low.slice(0, DRILL_DOWN_SHOWN).map((row): HealthDrillItem => ({
      ticketId: row.ticketId,
      origin: row.origin,
      category: row.category,
      situationId: row.situationId,
      agentId: row.resolverId,
      at: row.ratedAt.toISOString(),
      detail: { kind: "rating", rating: row.rating },
    })),
  };
}

/** The worst level among the metrics that could be measured; none measured is "insufficient". */
export function overallLevel(levels: readonly HealthLevel[]): HealthLevel {
  return (
    levels.toSorted((first, second) => LEVEL_SEVERITY[first] - LEVEL_SEVERITY[second]).at(0) ??
    "insufficient"
  );
}

function ratingCountsOf(ratings: readonly RatingRow[]): SupportHealth["ratingCounts"] {
  const counts: SupportHealth["ratingCounts"] = [0, 0, 0, 0, 0];
  for (const row of ratings) {
    const index = Math.min(BEST_RATING, Math.max(1, Math.round(row.rating))) - 1;
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
}

export function buildSupportHealth(input: {
  opened: Periods<OpenedTicketRow>;
  resolutions: Periods<ResolutionRow>;
  ratings: Periods<RatingRow>;
  queue: readonly QueueRow[];
  now: Date;
}): SupportHealth {
  const metrics = [
    onTimeMetric(input.opened, input.now),
    overdueMetric(input.queue, input.now),
    noReopenMetric(input.resolutions, input.now),
    ratingMetric(input.ratings),
  ];
  return {
    level: overallLevel(metrics.map((metric) => metric.level)),
    metrics,
    ratingCounts: ratingCountsOf(input.ratings.current),
  };
}
