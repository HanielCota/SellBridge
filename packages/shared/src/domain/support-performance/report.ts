import { OTHER_SITUATION_ID } from "../support-topics.ts";
import {
  brazilWeekdayHour,
  bucketKind,
  bucketOf,
  bucketStarts,
  isSupportHour,
  periodBounds,
  supportHourColumns,
} from "./calendar.ts";
import {
  median,
  minutesBetween,
  noReopenOf,
  OPEN_ENDED_ATTENTION_SHARE,
  OPEN_ENDED_MIN_TICKETS,
  rateOf,
  RISING_SUBJECT_MIN_GROWTH,
  RISING_SUBJECT_MIN_INCREASE,
} from "./rules.ts";
import { buildSubjects, subjectKeyOf } from "./subjects.ts";
import { buildTeam, onTimeOf, ratingRate } from "./team.ts";
import type {
  AgentPerformance,
  AttentionItem,
  HeatCell,
  OpenedTicketRow,
  QueueRow,
  Rate,
  RatingRow,
  ResolutionRow,
  SeriesPoint,
  SubjectPerformance,
  SupportOrigin,
  SupportPerformanceReport,
  SupportPerformanceRows,
  SupportPeriodDays,
} from "./types.ts";

const ORIGIN_KIND = { revendedor: "seller", fornecedor: "supplier" } as const;

function forOrigin<Row extends { origin: string }>(rows: readonly Row[], origin: SupportOrigin) {
  if (origin === "todos") {
    return rows;
  }
  return rows.filter((row) => row.origin === ORIGIN_KIND[origin]);
}

interface Bounds {
  since: Date;
  previousSince: Date;
}

function splitAt<Row>(rows: readonly Row[], bounds: Bounds, dateOf: (row: Row) => Date) {
  return {
    current: rows.filter((row) => dateOf(row) >= bounds.since),
    previous: rows.filter(
      (row) => dateOf(row) >= bounds.previousSince && dateOf(row) < bounds.since,
    ),
  };
}

function firstResponseMinutes(rows: readonly OpenedTicketRow[]): number | null {
  return median(
    rows.flatMap((row) =>
      row.firstResponseAt === null ? [] : [minutesBetween(row.createdAt, row.firstResponseAt)],
    ),
  );
}

function countByCategory(rows: readonly OpenedTicketRow[]) {
  const tally: Partial<Record<OpenedTicketRow["category"], number>> = {};
  for (const row of rows) {
    tally[row.category] = (tally[row.category] ?? 0) + 1;
  }
  return tally;
}

function series(input: {
  opened: readonly OpenedTicketRow[];
  resolutions: readonly ResolutionRow[];
  ratings: readonly RatingRow[];
  starts: readonly string[];
  activeAgents: number;
  now: Date;
}): SeriesPoint[] {
  const { opened, resolutions, starts, activeAgents } = input;
  const inBucket = (date: Date, start: string) => bucketOf(date, starts) === start;
  return starts.map((start) => {
    const openedHere = opened.filter((row) => inBucket(row.createdAt, start));
    const resolvedHere = resolutions.filter((row) => inBucket(row.closedAt, start));
    const byTeam = resolvedHere.filter((row) => row.resolverId !== null).length;
    const ratedHere = input.ratings.filter((row) => inBucket(row.ratedAt, start));
    return {
      start,
      opened: openedHere.length,
      resolved: resolvedHere.length,
      firstResponseMinutes: firstResponseMinutes(openedHere),
      teamResolvedPerAgent: activeAgents === 0 ? 0 : byTeam / activeAgents,
      noReopenRate: noReopenOf(resolvedHere, input.now).value,
      rating: ratingRate(ratedHere).value,
      openedByCategory: countByCategory(openedHere),
    };
  });
}

function heatmap(opened: readonly OpenedTicketRow[]): HeatCell[] {
  const columns: (number | "outside")[] = [...supportHourColumns(), "outside"];
  const tally = new Map<string, number>();
  for (const row of opened) {
    const { weekday, hour } = brazilWeekdayHour(row.createdAt);
    const key = `${weekday}|${isSupportHour(hour) ? hour : "outside"}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) =>
    columns.map((hour) => ({ weekday, hour, opened: tally.get(`${weekday}|${hour}`) ?? 0 })),
  );
}

function queueSummary(queue: readonly QueueRow[]) {
  return {
    open: queue.length,
    waiting: queue.filter((row) => row.awaitingSince !== null).length,
    overdue: queue.filter((row) => row.overdue).length,
    unassigned: queue.filter((row) => row.assigneeId === null).length,
  };
}

function overdueItem(queue: readonly QueueRow[], now: Date): AttentionItem[] {
  const overdue = queue.filter((row) => row.overdue);
  const oldest = overdue
    .flatMap((row) => (row.awaitingSince === null ? [] : [row.awaitingSince]))
    .toSorted((first, second) => first.getTime() - second.getTime())
    .at(0);
  if (overdue.length === 0 || oldest === undefined) {
    return [];
  }
  return [
    { kind: "overdue", count: overdue.length, oldestAwaitingMinutes: minutesBetween(oldest, now) },
  ];
}

function risingItem(subjects: readonly SubjectPerformance[]): AttentionItem[] {
  const rising = subjects
    .filter((subject) => {
      const current = subject.opened.current;
      const previous = subject.opened.previous;
      return (
        current - previous >= RISING_SUBJECT_MIN_INCREASE &&
        current >= previous * (1 + RISING_SUBJECT_MIN_GROWTH)
      );
    })
    .toSorted(
      (first, second) =>
        second.opened.current -
        second.opened.previous -
        (first.opened.current - first.opened.previous),
    )
    .at(0);
  if (rising === undefined) {
    return [];
  }
  const subject = {
    origin: rising.origin,
    category: rising.category,
    situationId: rising.situationId,
  };
  return [
    {
      kind: "rising_subject",
      subject,
      current: rising.opened.current,
      previous: rising.opened.previous,
    },
  ];
}

/** A topic where "Outro problema" is common: the form is missing a situation. */
function openEndedItem(opened: readonly OpenedTicketRow[]): AttentionItem[] {
  const guided = opened.filter((row) => row.situationId !== null);
  const topics = new Map<string, OpenedTicketRow[]>();
  for (const row of guided) {
    const key = `${row.origin}|${row.category}`;
    topics.set(key, [...(topics.get(key) ?? []), row]);
  }
  const worst = [...topics.values()]
    .filter((rows) => rows.length >= OPEN_ENDED_MIN_TICKETS)
    .map((rows) => ({
      rows,
      share: rateOf(rows, (row) => row.situationId === OTHER_SITUATION_ID).value ?? 0,
    }))
    .filter((topic) => topic.share >= OPEN_ENDED_ATTENTION_SHARE)
    .toSorted((first, second) => second.share - first.share)
    .at(0);
  const sample = worst?.rows[0];
  if (worst === undefined || sample === undefined) {
    return [];
  }
  return [
    { kind: "open_ended", origin: sample.origin, category: sample.category, share: worst.share },
  ];
}

function attention(input: {
  queue: readonly QueueRow[];
  now: Date;
  subjects: readonly SubjectPerformance[];
  team: readonly AgentPerformance[];
  opened: readonly OpenedTicketRow[];
}): AttentionItem[] {
  const unassigned = input.queue.filter((row) => row.assigneeId === null).length;
  return [
    ...overdueItem(input.queue, input.now),
    ...risingItem(input.subjects),
    ...input.team
      .filter((agent) => agent.standing === "needs_support")
      .map((agent) => ({
        kind: "needs_support" as const,
        agentId: agent.id,
        name: agent.name,
        onTime: agent.onTime,
        noReopen: agent.noReopen,
      })),
    ...(unassigned > 0 ? [{ kind: "unassigned" as const, count: unassigned }] : []),
    ...openEndedItem(input.opened),
  ];
}

/**
 * The team's "sem reabrir" per subject. Only closes a team member resolved: a customer closing
 * on their own says nothing about what the team achieves on that subject.
 */
function teamBySubject(resolutions: readonly ResolutionRow[], now: Date): Map<string, Rate> {
  const groups = new Map<string, ResolutionRow[]>();
  for (const row of resolutions.filter((resolution) => resolution.resolverId !== null)) {
    groups.set(subjectKeyOf(row), [...(groups.get(subjectKeyOf(row)) ?? []), row]);
  }
  return new Map([...groups].map(([key, rows]) => [key, noReopenOf(rows, now)]));
}

type Split<Row> = { current: Row[]; previous: Row[] };

/** Resolutions by team members ÷ team members who resolved any. */
function resolvedPerAgentOf(resolutions: readonly ResolutionRow[]): number | null {
  const byTeam = resolutions.filter((row) => row.resolverId !== null);
  const people = new Set(byTeam.map((row) => row.resolverId)).size;
  return people === 0 ? null : byTeam.length / people;
}

/** Ratings of closes made in the period ÷ closes in the period, capped at every one rated. */
function ratingShareOf(ratings: readonly RatingRow[], resolved: number, since: Date) {
  if (resolved === 0) {
    return null;
  }
  const ofThisPeriod = ratings.filter(
    (row) => row.ratedCloseAt !== null && row.ratedCloseAt >= since,
  ).length;
  return Math.min(1, ofThisPeriod / resolved);
}

interface PeriodSplit {
  opened: Split<OpenedTicketRow>;
  resolutions: Split<ResolutionRow>;
  ratings: Split<RatingRow>;
}

function overviewOf(
  split: PeriodSplit,
  bounds: Bounds,
  now: Date,
): SupportPerformanceReport["overview"] {
  const { opened, resolutions, ratings } = split;
  return {
    opened: { current: opened.current.length, previous: opened.previous.length },
    resolved: { current: resolutions.current.length, previous: resolutions.previous.length },
    firstResponseMinutes: {
      current: firstResponseMinutes(opened.current),
      previous: firstResponseMinutes(opened.previous),
    },
    onTime: onTimeOf(opened.current, now),
    noReopen: noReopenOf(resolutions.current, now),
    previousNoReopen: noReopenOf(resolutions.previous, now),
    rating: ratingRate(ratings.current),
    previousRating: ratingRate(ratings.previous),
    ratingRate: ratingShareOf(ratings.current, resolutions.current.length, bounds.since),
    resolvedPerAgent: resolvedPerAgentOf(resolutions.current),
  };
}

/** The rows of the chosen customers, split into the period and the one before it. */
function rowsOfPeriod(
  input: { rows: SupportPerformanceRows; origin: SupportOrigin },
  bounds: Bounds,
) {
  const { rows, origin } = input;
  return {
    opened: splitAt(forOrigin(rows.opened, origin), bounds, (row) => row.createdAt),
    resolutions: splitAt(forOrigin(rows.resolutions, origin), bounds, (row) => row.closedAt),
    ratings: splitAt(forOrigin(rows.ratings, origin), bounds, (row) => row.ratedAt),
    queue: forOrigin(rows.queue, origin),
    replies: forOrigin(rows.replies, origin).filter((row) => row.createdAt >= bounds.since),
  };
}

/** Builds the whole support performance report from the raw rows of two periods. */
export function buildSupportPerformanceReport(input: {
  rows: SupportPerformanceRows;
  now: Date;
  days: SupportPeriodDays;
  origin: SupportOrigin;
}): SupportPerformanceReport {
  const bounds = periodBounds(input.now, input.days);
  const starts = bucketStarts(bounds.since, input.now, bucketKind(input.days));
  const { opened, resolutions, ratings, queue, replies } = rowsOfPeriod(input, bounds);
  const subjects = buildSubjects({
    opened: opened.current,
    previousOpened: opened.previous,
    resolutions: resolutions.current,
    ratings: ratings.current,
    now: input.now,
  });
  const team = buildTeam(
    { staff: input.rows.staff, opened: opened.current, resolutions: resolutions.current },
    { previousResolutions: resolutions.previous, ratings: ratings.current, replies, queue },
    {
      now: input.now,
      bucketStarts: starts,
      teamBySubject: teamBySubject(resolutions.current, input.now),
    },
  );
  return {
    days: input.days,
    origin: input.origin,
    since: bounds.since.toISOString(),
    until: input.now.toISOString(),
    bucket: bucketKind(input.days),
    overview: overviewOf({ opened, resolutions, ratings }, bounds, input.now),
    queue: queueSummary(queue),
    series: series({
      opened: opened.current,
      resolutions: resolutions.current,
      ratings: ratings.current,
      starts,
      activeAgents: team.filter((agent) => (agent.resolved.current ?? 0) > 0).length,
      now: input.now,
    }),
    heatmap: heatmap(opened.current),
    subjects,
    team,
    attention: attention({ queue, now: input.now, subjects, team, opened: opened.current }),
  };
}
