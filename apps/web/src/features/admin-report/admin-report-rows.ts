import type { AdminReportRows } from "@sellbridge/database/repositories";
import type { ReportPeriod } from "@sellbridge/shared/report-period";
import {
  buildTeam,
  type AgentPerformance,
  type OpenedTicketRow,
  type RatingRow,
  type ResolutionRow,
  type SupportPerformanceRows,
  type TeamReplyRow,
} from "@sellbridge/shared/support-performance";
import type { TicketCategory } from "@sellbridge/shared/ticket-rules";

/*
 * The support rows cut to calendar windows (the report's period and the one it is compared
 * with), and the team worked out from them with the same `buildTeam` the "Desempenho" screen
 * uses, so a person's numbers read the same on both.
 */

interface Window {
  from: Date;
  to: Date;
}

function within(date: Date, window: Window): boolean {
  return date.getTime() >= window.from.getTime() && date.getTime() < window.to.getTime();
}

export interface WindowRows {
  opened: OpenedTicketRow[];
  resolutions: ResolutionRow[];
  ratings: RatingRow[];
  replies: TeamReplyRow[];
}

export function rowsWithin(rows: SupportPerformanceRows, window: Window): WindowRows {
  return {
    opened: rows.opened.filter((row) => within(row.createdAt, window)),
    resolutions: rows.resolutions.filter((row) => within(row.closedAt, window)),
    ratings: rows.ratings.filter((row) => within(row.ratedAt, window)),
    replies: rows.replies.filter((row) => within(row.createdAt, window)),
  };
}

export interface PeriodRows {
  current: WindowRows;
  previous: WindowRows;
}

export function periodRowsOf(rows: SupportPerformanceRows, period: ReportPeriod): PeriodRows {
  return { current: rowsWithin(rows, period), previous: rowsWithin(rows, period.previous) };
}

export interface AdminTeamMember {
  performance: AgentPerformance;
  /** No longer on the team: the period still credits what they did. */
  former: boolean;
  /** Public replies to customers in the period. */
  replies: number;
  /** The topic this person closed the most. */
  topCategory: TicketCategory | null;
}

function topCategoryOf(agent: AgentPerformance): TicketCategory | null {
  const tally = new Map<TicketCategory, number>();
  for (const subject of agent.subjects) {
    tally.set(subject.category, (tally.get(subject.category) ?? 0) + subject.resolved);
  }
  const sorted = [...tally].toSorted((first, second) => second[1] - first[1]);
  return sorted.at(0)?.[0] ?? null;
}

function worked(agent: AgentPerformance): boolean {
  return agent.activeDays > 0 || (agent.resolved.current ?? 0) > 0;
}

/**
 * Everyone who worked in the period (replied or closed), most closes first and then by name:
 * the order "Atendente 1, 2…" follows on the page and in every spreadsheet.
 */
export function adminTeamOf(
  rows: AdminReportRows,
  period: PeriodRows,
  now: Date,
): AdminTeamMember[] {
  const formerIds = new Set(rows.formerStaff.map((member) => member.id));
  const team = buildTeam(
    { staff: rows.performance.staff, ...period.current },
    {
      previousResolutions: period.previous.resolutions,
      ratings: period.current.ratings,
      replies: period.current.replies,
      queue: rows.performance.queue,
    },
    // One bucket and no subject yardstick: the report has no per-week chart or standing.
    { now, bucketStarts: [], teamBySubject: new Map() },
  );
  return team
    .filter(worked)
    .toSorted(
      (first, second) =>
        (second.resolved.current ?? 0) - (first.resolved.current ?? 0) ||
        first.name.localeCompare(second.name, "pt-BR"),
    )
    .map((performance) => ({
      performance,
      former: formerIds.has(performance.id),
      replies: period.current.replies.filter((row) => row.authorId === performance.id).length,
      topCategory: topCategoryOf(performance),
    }));
}
