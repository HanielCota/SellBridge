import type { ProfileKind } from "../profile-kind.ts";
import type { StaffRole } from "../staff-access.ts";
import type { TicketCategory, TicketPriority } from "../ticket-rules.ts";

/*
 * Raw rows the database hands to the support performance report, and the report itself. Rows
 * cover the chosen period and the one before it, so every figure can say how it moved.
 */

/** Which customers a report covers: everyone, resellers or suppliers. */
export const SUPPORT_ORIGINS = ["todos", "revendedor", "fornecedor"] as const;
export type SupportOrigin = (typeof SUPPORT_ORIGINS)[number];

export const SUPPORT_PERIOD_DAYS = [7, 30, 90] as const;
export type SupportPeriodDays = (typeof SUPPORT_PERIOD_DAYS)[number];

/** A ticket opened in the current or previous period. */
export interface OpenedTicketRow {
  ticketId: string;
  tenantId: string;
  origin: ProfileKind;
  category: TicketCategory;
  situationId: string | null;
  priority: TicketPriority;
  createdAt: Date;
  firstResponseAt: Date | null;
  /** Author of the first public team reply, credited with the first response. */
  firstResponderId: string | null;
}

/** One close of a ticket. A ticket reopened and closed again yields two rows. */
export interface ResolutionRow {
  ticketId: string;
  origin: ProfileKind;
  category: TicketCategory;
  situationId: string | null;
  openedAt: Date;
  closedAt: Date;
  /** Author of the last public team reply before the close; null when the team never wrote. */
  resolverId: string | null;
  /** Reopened, or the same customer opened the same complaint again, within the window. */
  cameBack: boolean;
}

export interface RatingRow {
  ticketId: string;
  origin: ProfileKind;
  category: TicketCategory;
  situationId: string | null;
  ratedAt: Date;
  rating: number;
  comment: string | null;
  /** Whoever resolved the close that was rated. */
  resolverId: string | null;
  /** When that rated close happened; the rating rate only counts closes inside the period. */
  ratedCloseAt: Date | null;
}

/** A public team reply, for active days and "last reply". */
export interface TeamReplyRow {
  authorId: string;
  origin: ProfileKind;
  createdAt: Date;
}

/** An open ticket right now (not limited to the period). */
export interface QueueRow {
  ticketId: string;
  origin: ProfileKind;
  assigneeId: string | null;
  /** Since when support owes an answer; null when it is the customer's turn. */
  awaitingSince: Date | null;
  overdue: boolean;
}

export interface StaffRow {
  id: string;
  name: string;
  role: StaffRole;
  joinedAt: Date;
  /** Blocked accounts only show when they worked tickets in the period. */
  banned: boolean;
}

export interface SupportPerformanceRows {
  opened: readonly OpenedTicketRow[];
  resolutions: readonly ResolutionRow[];
  ratings: readonly RatingRow[];
  replies: readonly TeamReplyRow[];
  queue: readonly QueueRow[];
  staff: readonly StaffRow[];
}

/** A figure and the same figure in the previous period of the same length. */
export interface Comparison {
  current: number | null;
  previous: number | null;
}

/** A share and how many items it was measured on, so small samples can say so. */
export interface Rate {
  value: number | null;
  sample: number;
}

export type AgentStanding = "overdue" | "too_few" | "needs_support" | "above_team" | "on_par";

export interface SubjectKey {
  origin: ProfileKind;
  category: TicketCategory;
  situationId: string | null;
}

export interface AgentSubject extends SubjectKey {
  resolved: number;
  noReopen: Rate;
  teamNoReopen: Rate;
}

export interface LowRating extends SubjectKey {
  ticketId: string;
  rating: number;
  comment: string | null;
  ratedAt: string;
}

export interface AgentPerformance {
  id: string;
  name: string;
  role: StaffRole;
  joinedAt: string;
  onProbation: boolean;
  standing: AgentStanding;
  resolved: Comparison;
  activeDays: number;
  resolvedPerActiveDay: number | null;
  firstResponseMinutes: number | null;
  onTime: Rate;
  noReopen: Rate;
  /** What the team reaches on the same mix of subjects: the fair yardstick for `noReopen`. */
  expectedNoReopen: number | null;
  rating: Rate;
  openNow: number;
  overdueNow: number;
  oldestAwaitingMinutes: number | null;
  lastReplyAt: string | null;
  /** Resolved per bucket, aligned with the report's series. */
  resolvedSeries: number[];
  subjects: AgentSubject[];
  lowRatings: LowRating[];
}

export interface SubjectPerformance extends SubjectKey {
  /** Tickets opened in the period and in the one before it. */
  opened: { current: number; previous: number };
  resolved: number;
  resolveMinutes: number | null;
  noReopen: Rate;
  rating: Rate;
  /** The team member with the most resolutions that did not come back, given enough of them. */
  bestAgentId: string | null;
}

export interface SeriesPoint {
  /** First day of the bucket, YYYY-MM-DD on the Brasília calendar. */
  start: string;
  opened: number;
  resolved: number;
  firstResponseMinutes: number | null;
  /** Average resolved per active team member in the bucket, for the person chart. */
  teamResolvedPerAgent: number;
  /** Share of the bucket's resolutions that did not come back; null without resolutions. */
  noReopenRate: number | null;
  /** Average rating given in the bucket; null without ratings. */
  rating: number | null;
  /** Tickets opened per topic, for the subjects chart. */
  openedByCategory: Partial<Record<TicketCategory, number>>;
}

export interface HeatCell {
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  /** Hour on the Brasília clock inside support hours, or "outside". */
  hour: number | "outside";
  opened: number;
}

export type AttentionItem =
  | { kind: "overdue"; count: number; oldestAwaitingMinutes: number }
  | { kind: "unassigned"; count: number }
  | { kind: "rising_subject"; subject: SubjectKey; current: number; previous: number }
  | { kind: "needs_support"; agentId: string; name: string; onTime: Rate; noReopen: Rate }
  | { kind: "open_ended"; origin: ProfileKind; category: TicketCategory; share: number };

export interface SupportPerformanceReport {
  days: SupportPeriodDays;
  origin: SupportOrigin;
  since: string;
  until: string;
  bucket: "day" | "week";
  overview: {
    opened: Comparison;
    resolved: Comparison;
    firstResponseMinutes: Comparison;
    onTime: Rate;
    noReopen: Rate;
    previousNoReopen: Rate;
    rating: Rate;
    previousRating: Rate;
    /** Share of the period's resolutions that were rated (never above 1). */
    ratingRate: number | null;
    /** Resolutions by team members ÷ team members who resolved any: one figure everywhere. */
    resolvedPerAgent: number | null;
  };
  /** `open`: every ticket not closed; `waiting`: the ones where support owes an answer. */
  queue: { open: number; waiting: number; overdue: number; unassigned: number };
  series: SeriesPoint[];
  heatmap: HeatCell[];
  subjects: SubjectPerformance[];
  team: AgentPerformance[];
  attention: AttentionItem[];
}
