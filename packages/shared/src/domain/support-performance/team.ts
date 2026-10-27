import { RESPONSE_TARGET_HOURS } from "../ticket-rules.ts";
import { DAY_MILLISECONDS } from "../time.ts";
import { brazilDay, bucketOf } from "./calendar.ts";
import {
  agentStanding,
  CAME_BACK_WINDOW_DAYS,
  expectedRate,
  median,
  minutesBetween,
  noReopenOf,
  PROBATION_DAYS,
  rateOf,
  STANDING_ORDER,
} from "./rules.ts";
import { subjectKeyOf } from "./subjects.ts";
import type {
  AgentPerformance,
  AgentSubject,
  LowRating,
  OpenedTicketRow,
  QueueRow,
  Rate,
  RatingRow,
  ResolutionRow,
  StaffRow,
  TeamReplyRow,
} from "./types.ts";

const HOUR_MILLISECONDS = 3_600_000;
const CAME_BACK_WINDOW_MILLISECONDS = CAME_BACK_WINDOW_DAYS * DAY_MILLISECONDS;
const LOW_RATING_MAX = 3;
const LOW_RATINGS_SHOWN = 5;

export function answeredOnTime(row: OpenedTicketRow): boolean {
  if (row.firstResponseAt === null) {
    return false;
  }
  return row.firstResponseAt.getTime() <= deadlineOf(row);
}

function deadlineOf(row: OpenedTicketRow): number {
  return row.createdAt.getTime() + RESPONSE_TARGET_HOURS[row.priority] * HOUR_MILLISECONDS;
}

/**
 * The team's "no prazo": answered tickets, plus the unanswered ones whose deadline already
 * passed (late for sure). Unanswered tickets still inside their deadline wait to be judged.
 */
export function onTimeOf(rows: readonly OpenedTicketRow[], now: Date): Rate {
  return rateOf(
    rows.filter((row) => judgedOnTime(row, now)),
    answeredOnTime,
  );
}

/** Answered, or past its deadline without an answer: either way "no prazo" can tell. */
function judgedOnTime(row: OpenedTicketRow, now: Date): boolean {
  return row.firstResponseAt !== null || deadlineOf(row) < now.getTime();
}

/** A ticket that counts against "no prazo": answered late, or still unanswered past due. */
export function lateFirstResponse(row: OpenedTicketRow, now: Date): boolean {
  return judgedOnTime(row, now) && !answeredOnTime(row);
}

export function ratingRate(rows: readonly RatingRow[]): Rate {
  if (rows.length === 0) {
    return { value: null, sample: 0 };
  }
  return {
    value: rows.reduce((sum, row) => sum + row.rating, 0) / rows.length,
    sample: rows.length,
  };
}

export interface TeamRows {
  staff: readonly StaffRow[];
  opened: readonly OpenedTicketRow[];
  resolutions: readonly ResolutionRow[];
  previousResolutions: readonly ResolutionRow[];
  ratings: readonly RatingRow[];
  replies: readonly TeamReplyRow[];
  queue: readonly QueueRow[];
}

export interface TeamContext {
  now: Date;
  bucketStarts: readonly string[];
  /** The team's "sem reabrir" per subject key, with its sample. */
  teamBySubject: ReadonlyMap<string, Rate>;
}

function counts(keys: readonly string[]): Map<string, number> {
  const tally = new Map<string, number>();
  for (const key of keys) {
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return tally;
}

function agentSubjects(own: readonly ResolutionRow[], context: TeamContext): AgentSubject[] {
  const byKey = new Map<string, ResolutionRow[]>();
  for (const row of own) {
    byKey.set(subjectKeyOf(row), [...(byKey.get(subjectKeyOf(row)) ?? []), row]);
  }
  return [...byKey.entries()]
    .map(([key, rows]) => ({
      origin: rows[0]?.origin ?? "seller",
      category: rows[0]?.category ?? "other",
      situationId: rows[0]?.situationId ?? null,
      resolved: rows.length,
      noReopen: noReopenOf(rows, context.now),
      teamNoReopen: context.teamBySubject.get(key) ?? { value: null, sample: 0 },
    }))
    .toSorted((first, second) => second.resolved - first.resolved);
}

function lowRatingsOf(rows: readonly RatingRow[]): LowRating[] {
  return rows
    .filter((row) => row.rating <= LOW_RATING_MAX)
    .toSorted((first, second) => second.ratedAt.getTime() - first.ratedAt.getTime())
    .slice(0, LOW_RATINGS_SHOWN)
    .map((row) => ({
      ticketId: row.ticketId,
      origin: row.origin,
      category: row.category,
      situationId: row.situationId,
      rating: row.rating,
      comment: row.comment,
      ratedAt: row.ratedAt.toISOString(),
    }));
}

function queueOf(rows: readonly QueueRow[], now: Date) {
  const waiting = rows.flatMap((row) => (row.awaitingSince === null ? [] : [row.awaitingSince]));
  const oldest = waiting.toSorted((first, second) => first.getTime() - second.getTime()).at(0);
  return {
    openNow: rows.length,
    overdueNow: rows.filter((row) => row.overdue).length,
    oldestAwaitingMinutes: oldest === undefined ? null : minutesBetween(oldest, now),
  };
}

function lastReplyOf(rows: readonly TeamReplyRow[]): string | null {
  const latest = rows.toSorted(
    (first, second) => second.createdAt.getTime() - first.createdAt.getTime(),
  );
  return latest.at(0)?.createdAt.toISOString() ?? null;
}

function performanceOf(member: StaffRow, rows: TeamRows, context: TeamContext): AgentPerformance {
  const own = rows.resolutions.filter((row) => row.resolverId === member.id);
  const firstReplies = rows.opened.filter(
    (row) => row.firstResponderId === member.id && row.firstResponseAt !== null,
  );
  const replies = rows.replies.filter((row) => row.authorId === member.id);
  const activeDays = new Set(replies.map((row) => brazilDay(row.createdAt))).size;
  const noReopen = noReopenOf(own, context.now);
  const onTime = rateOf(firstReplies, answeredOnTime);
  const teamRates = new Map(
    [...context.teamBySubject].flatMap(([key, rate]) =>
      rate.value === null ? [] : [[key, rate.value] as const],
    ),
  );
  const settled = own.filter(
    (row) => row.closedAt.getTime() <= context.now.getTime() - CAME_BACK_WINDOW_MILLISECONDS,
  );
  const expectedNoReopen = expectedRate(counts(settled.map(subjectKeyOf)), teamRates);
  const queue = queueOf(
    rows.queue.filter((row) => row.assigneeId === member.id),
    context.now,
  );
  const perBucket = counts(
    own.flatMap((row) => bucketOf(row.closedAt, context.bucketStarts) ?? []),
  );
  const previous = rows.previousResolutions.filter((row) => row.resolverId === member.id).length;
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
    // Owners and admins run the platform; only the support roles go through a probation.
    onProbation:
      member.role !== "admin" &&
      context.now.getTime() - member.joinedAt.getTime() < PROBATION_DAYS * DAY_MILLISECONDS,
    standing: agentStanding({ ...queue, resolved: own.length, onTime, noReopen, expectedNoReopen }),
    resolved: { current: own.length, previous },
    activeDays,
    resolvedPerActiveDay: activeDays === 0 ? null : own.length / activeDays,
    firstResponseMinutes: median(
      firstReplies.flatMap((row) =>
        row.firstResponseAt === null ? [] : [minutesBetween(row.createdAt, row.firstResponseAt)],
      ),
    ),
    onTime,
    noReopen,
    expectedNoReopen,
    rating: ratingRate(rows.ratings.filter((row) => row.resolverId === member.id)),
    ...queue,
    lastReplyAt: lastReplyOf(replies),
    replies: replies.length,
    resolvedSeries: context.bucketStarts.map((start) => perBucket.get(start) ?? 0),
    subjects: agentSubjects(own, context),
    lowRatings: lowRatingsOf(rows.ratings.filter((row) => row.resolverId === member.id)),
  };
}

/**
 * Agents and supervisors always show; admins and blocked accounts only when they actually
 * worked tickets, so neither pads the team with empty rows.
 */
function belongsOnTheBoard(performance: AgentPerformance, member: StaffRow): boolean {
  if (performance.role !== "admin" && !member.banned) {
    return true;
  }
  return (
    (performance.resolved.current ?? 0) > 0 || performance.activeDays > 0 || performance.openNow > 0
  );
}

/** Every team member's figures, the ones who need the coordinator first. */
export function buildTeam(
  period: Pick<TeamRows, "staff" | "opened" | "resolutions">,
  activity: Omit<TeamRows, "staff" | "opened" | "resolutions">,
  context: TeamContext,
): AgentPerformance[] {
  const rows: TeamRows = { ...period, ...activity };
  return rows.staff
    .flatMap((member) => {
      const performance = performanceOf(member, rows, context);
      return belongsOnTheBoard(performance, member) ? [performance] : [];
    })
    .toSorted(
      (first, second) =>
        STANDING_ORDER[first.standing] - STANDING_ORDER[second.standing] ||
        first.name.localeCompare(second.name, "pt-BR"),
    );
}
