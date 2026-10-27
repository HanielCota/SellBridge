import { OTHER_SITUATION_ID } from "../support-topics.ts";
import { bucketStarts } from "./calendar.ts";
import { buildHeatmap } from "./heatmap.ts";
import {
  minutesBetween,
  noReopenOf,
  OPEN_ENDED_ATTENTION_SHARE,
  OPEN_ENDED_MIN_TICKETS,
  rateOf,
  RISING_SUBJECT_MIN_GROWTH,
  RISING_SUBJECT_MIN_INCREASE,
} from "./rules.ts";
import { buildSupportHealth } from "./health.ts";
import { buildSubjects, subjectKeyOf } from "./subjects.ts";
import { buildSeries, firstResponseMinutes } from "./series.ts";
import { buildTeam, onTimeOf, ratingRate } from "./team.ts";
import { buildToday } from "./today.ts";
import type {
  AgentPerformance,
  AttentionItem,
  OpenedTicketRow,
  QueueRow,
  Rate,
  RatingRow,
  ResolutionRow,
  SubjectPerformance,
  SupportBucket,
  SupportOrigin,
  SupportPerformanceReport,
  SupportPerformanceRows,
  SupportPeriodPreset,
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
  /** Exclusive end of the period; a custom range in the past ends before today. */
  until: Date;
  previousSince: Date;
}

function splitAt<Row>(rows: readonly Row[], bounds: Bounds, dateOf: (row: Row) => Date) {
  return {
    current: rows.filter((row) => dateOf(row) >= bounds.since && dateOf(row) < bounds.until),
    previous: rows.filter(
      (row) => dateOf(row) >= bounds.previousSince && dateOf(row) < bounds.since,
    ),
  };
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
    replies: forOrigin(rows.replies, origin).filter(
      (row) => row.createdAt >= bounds.since && row.createdAt < bounds.until,
    ),
  };
}

/** The period as the report is asked for: the reports' resolved period plus its preset. */
export interface SupportReportPeriod {
  preset: SupportPeriodPreset;
  from: Date;
  to: Date;
  previousFrom: Date;
  days: number;
  bucket: SupportBucket;
  fromDate: string;
  toDate: string;
}

const DAYS_PER_WEEK = 7;
const DAY_MILLISECONDS = 86_400_000;

/** Builds the whole support performance report from the raw rows of two periods. */
export function buildSupportPerformanceReport(input: {
  rows: SupportPerformanceRows;
  now: Date;
  period: SupportReportPeriod;
  origin: SupportOrigin;
}): SupportPerformanceReport {
  const { period, now } = input;
  const bounds = { since: period.from, until: period.to, previousSince: period.previousFrom };
  const until = new Date(Math.min(now.getTime(), period.to.getTime()));
  const starts = bucketStarts(period.from, until, period.bucket);
  const { opened, resolutions, ratings, queue, replies } = rowsOfPeriod(input, bounds);
  const subjects = buildSubjects({
    opened: opened.current,
    previousOpened: opened.previous,
    resolutions: resolutions.current,
    ratings: ratings.current,
    now,
  });
  const team = buildTeam(
    { staff: input.rows.staff, opened: opened.current, resolutions: resolutions.current },
    { previousResolutions: resolutions.previous, ratings: ratings.current, replies, queue },
    { now, bucketStarts: starts, teamBySubject: teamBySubject(resolutions.current, now) },
  );
  return {
    period: reportPeriodOf(period),
    origin: input.origin,
    since: period.from.toISOString(),
    until: until.toISOString(),
    bucket: period.bucket,
    overview: overviewOf({ opened, resolutions, ratings }, bounds, now),
    queue: queueSummary(queue),
    series: buildSeries({
      opened,
      resolutions,
      ratings: ratings.current,
      starts,
      activeAgents: team.filter((agent) => (agent.resolved.current ?? 0) > 0).length,
      now,
      shiftMilliseconds: period.days * DAY_MILLISECONDS,
    }),
    heatmap: buildHeatmap({ opened: opened.current, replies, weeks: weeksIn(period), now }),
    subjects,
    team,
    attention: attention({ queue, now, subjects, team, opened: opened.current }),
    health: buildSupportHealth({ opened, resolutions, ratings, queue, now }),
    today:
      period.days === 1
        ? buildToday({
            ...currentRows({ opened, resolutions, ratings }),
            replies,
            fromDate: period.fromDate,
            now,
          })
        : null,
  };
}

function currentRows<Opened, Resolution, Rating>(rows: {
  opened: { current: Opened };
  resolutions: { current: Resolution };
  ratings: { current: Rating };
}): { opened: Opened; resolutions: Resolution; ratings: Rating } {
  return {
    opened: rows.opened.current,
    resolutions: rows.resolutions.current,
    ratings: rows.ratings.current,
  };
}

function weeksIn(period: Pick<SupportReportPeriod, "days">): number {
  return Math.max(1, period.days / DAYS_PER_WEEK);
}

function reportPeriodOf(period: SupportReportPeriod): SupportPerformanceReport["period"] {
  return {
    preset: period.preset,
    fromDate: period.fromDate,
    toDate: period.toDate,
    days: period.days,
  };
}
