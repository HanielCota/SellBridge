import { bucketOf } from "./calendar.ts";
import {
  levelAgainstTarget,
  overallLevel,
  SUPPORT_TARGETS,
  TARGET_WARNING_MARGIN,
} from "./health.ts";
import { median, minutesBetween, noReopenOf } from "./rules.ts";
import { lateFirstResponse, onTimeOf, ratingRate } from "./team.ts";
import type {
  HealthLevel,
  OpenedTicketRow,
  RatingRow,
  ResolutionRow,
  SeriesPoint,
} from "./types.ts";
import type { TicketCategory } from "../ticket-rules.ts";

/*
 * The report's time series: one point per bucket (hour, day or week) with what came in, what
 * was solved, the same bucket of the previous period and the support's level in it.
 */

export function firstResponseMinutes(rows: readonly OpenedTicketRow[]): number | null {
  return median(
    rows.flatMap((row) =>
      row.firstResponseAt === null ? [] : [minutesBetween(row.createdAt, row.firstResponseAt)],
    ),
  );
}

function countByCategory(rows: readonly OpenedTicketRow[]) {
  const tally: Partial<Record<TicketCategory, number>> = {};
  for (const row of rows) {
    tally[row.category] = (tally[row.category] ?? 0) + 1;
  }
  return tally;
}

/** The situation picked most often inside each topic; ties keep the first one seen. */
function topSituationByCategory(rows: readonly OpenedTicketRow[]) {
  const tally = new Map<TicketCategory, Map<string | null, number>>();
  for (const row of rows) {
    const situations = tally.get(row.category) ?? new Map<string | null, number>();
    situations.set(row.situationId, (situations.get(row.situationId) ?? 0) + 1);
    tally.set(row.category, situations);
  }
  const top: Partial<Record<TicketCategory, string | null>> = {};
  for (const [category, situations] of tally) {
    const best = [...situations].toSorted((first, second) => second[1] - first[1]).at(0);
    top[category] = best === undefined ? null : best[0];
  }
  return top;
}

/** The bucket's level on the targets a bucket can measure (the queue right now has no past). */
function bucketLevel(input: {
  opened: readonly OpenedTicketRow[];
  resolved: readonly ResolutionRow[];
  rated: readonly RatingRow[];
  now: Date;
}): HealthLevel {
  return overallLevel([
    levelAgainstTarget(
      onTimeOf(input.opened, input.now),
      SUPPORT_TARGETS.on_time,
      TARGET_WARNING_MARGIN.on_time,
    ),
    levelAgainstTarget(
      noReopenOf(input.resolved, input.now),
      SUPPORT_TARGETS.no_reopen,
      TARGET_WARNING_MARGIN.no_reopen,
    ),
    levelAgainstTarget(
      ratingRate(input.rated),
      SUPPORT_TARGETS.rating,
      TARGET_WARNING_MARGIN.rating,
    ),
  ]);
}

interface Periods<Row> {
  current: readonly Row[];
  previous: readonly Row[];
}

export function buildSeries(input: {
  opened: Periods<OpenedTicketRow>;
  resolutions: Periods<ResolutionRow>;
  ratings: readonly RatingRow[];
  starts: readonly string[];
  activeAgents: number;
  now: Date;
  /** The length of the period: a previous row moved by it lands in its matching bucket. */
  shiftMilliseconds: number;
}): SeriesPoint[] {
  const { starts, activeAgents, now } = input;
  const inBucket = (date: Date, start: string) => bucketOf(date, starts) === start;
  const shifted = (date: Date) => new Date(date.getTime() + input.shiftMilliseconds);
  return starts.map((start) => {
    const openedHere = input.opened.current.filter((row) => inBucket(row.createdAt, start));
    const resolvedHere = input.resolutions.current.filter((row) => inBucket(row.closedAt, start));
    const ratedHere = input.ratings.filter((row) => inBucket(row.ratedAt, start));
    const byTeam = resolvedHere.filter((row) => row.resolverId !== null).length;
    return {
      start,
      opened: openedHere.length,
      resolved: resolvedHere.length,
      previousOpened: input.opened.previous.filter((row) => inBucket(shifted(row.createdAt), start))
        .length,
      previousResolved: input.resolutions.previous.filter((row) =>
        inBucket(shifted(row.closedAt), start),
      ).length,
      healthLevel: bucketLevel({
        opened: openedHere,
        resolved: resolvedHere,
        rated: ratedHere,
        now,
      }),
      firstResponseMinutes: firstResponseMinutes(openedHere),
      onTimeRate: onTimeOf(openedHere, now).value,
      lateFirstResponses: openedHere.filter((row) => lateFirstResponse(row, now)).length,
      teamResolvedPerAgent: activeAgents === 0 ? 0 : byTeam / activeAgents,
      noReopenRate: noReopenOf(resolvedHere, now).value,
      rating: ratingRate(ratedHere).value,
      openedByCategory: countByCategory(openedHere),
      topSituationByCategory: topSituationByCategory(openedHere),
    };
  });
}
