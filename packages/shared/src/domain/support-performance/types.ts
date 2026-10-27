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

/** The periods the screen offers: the reports' presets, from today to a custom range. */
export const SUPPORT_PERIODS = ["today", "7d", "30d", "90d", "custom"] as const;
export type SupportPeriodPreset = (typeof SUPPORT_PERIODS)[number];

/** Hour by hour for one day, day by day up to six weeks, week by week beyond. */
export type SupportBucket = "hour" | "day" | "week";

/** The period a report covers, as the screen shows it and as its links carry it. */
export interface SupportPeriod {
  preset: SupportPeriodPreset;
  /** Calendar dates in Brasília, inclusive. */
  fromDate: string;
  toDate: string;
  days: number;
}

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
  category: TicketCategory;
  situationId: string | null;
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
  /** Public replies the person wrote in the period. */
  replies: number;
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
  /** First day of the bucket (YYYY-MM-DD), or its hour (YYYY-MM-DDTHH), on the Brasília calendar. */
  start: string;
  opened: number;
  resolved: number;
  /** The same bucket of the previous period, for the comparison lines and tooltips. */
  previousOpened: number;
  previousResolved: number;
  /** The support's level in the bucket, from the same targets as the health block. */
  healthLevel: HealthLevel;
  firstResponseMinutes: number | null;
  /** Average resolved per active team member in the bucket, for the person chart. */
  teamResolvedPerAgent: number;
  /** Share of the bucket's first responses on time; null without any to judge. */
  onTimeRate: number | null;
  /** Tickets opened in the bucket whose first response came, or is still due, after the deadline. */
  lateFirstResponses: number;
  /** Share of the bucket's resolutions that did not come back; null without resolutions. */
  noReopenRate: number | null;
  /** Average rating given in the bucket; null without ratings. */
  rating: number | null;
  /** Tickets opened per topic, for the subjects chart. */
  openedByCategory: Partial<Record<TicketCategory, number>>;
  /** The situation most picked inside each topic, for the subjects chart's tooltip. */
  topSituationByCategory: Partial<Record<TicketCategory, string | null>>;
}

/** A ticket opened in one cell of the hours heatmap, for the panel a click opens. */
export interface HeatTicket extends SubjectKey {
  ticketId: string;
  createdAt: string;
  /** Who answered first; null while nobody did. */
  agentId: string | null;
  status: "answered_on_time" | "answered_late" | "waiting" | "late";
}

export interface HeatCell {
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  /** Hour on the Brasília clock inside support hours, or "outside". */
  hour: number | "outside";
  opened: number;
  /** Median first response of the cell's tickets, in minutes; null without answers. */
  firstResponseMinutes: number | null;
  /** Team members who replied in that weekday and hour, on average per week of the period. */
  responders: number;
  /** The subject most opened in the cell. */
  topSubject: SubjectKey | null;
  /** The cell's latest tickets, newest first. */
  recent: HeatTicket[];
}

/** One line of the day's timeline: something that happened to a ticket. */
export interface TodayEvent extends SubjectKey {
  ticketId: string;
  at: string;
  kind: "opened" | "resolved" | "rated";
  agentId: string | null;
  rating: number | null;
}

/** The day panel, only for a single-day period. */
export interface SupportToday {
  isToday: boolean;
  opened: number;
  replies: number;
  resolved: number;
  /** Median first response of the day; null without answers. */
  firstResponseMinutes: number | null;
  rating: Rate;
  cameBack: number;
  events: TodayEvent[];
}

export type AttentionItem =
  | { kind: "overdue"; count: number; oldestAwaitingMinutes: number }
  | { kind: "unassigned"; count: number }
  | { kind: "rising_subject"; subject: SubjectKey; current: number; previous: number }
  | { kind: "needs_support"; agentId: string; name: string; onTime: Rate; noReopen: Rate }
  | { kind: "open_ended"; origin: ProfileKind; category: TicketCategory; share: number };

/** Where a metric stands against its target; `insufficient` below the minimum sample. */
export type HealthLevel = "on_target" | "warning" | "off_target" | "insufficient";

export const HEALTH_METRIC_KEYS = ["on_time", "overdue_now", "no_reopen", "rating"] as const;
export type HealthMetricKey = (typeof HEALTH_METRIC_KEYS)[number];

/** Why a ticket counts against a metric. */
export type HealthDrillDetail =
  | { kind: "answered_late"; responseMinutes: number }
  | { kind: "unanswered" }
  | { kind: "waiting"; minutes: number }
  | { kind: "came_back" }
  | { kind: "rating"; rating: number };

/** One ticket behind a metric, so a number can always be checked against real tickets. */
export interface HealthDrillItem extends SubjectKey {
  ticketId: string;
  /** The team member it counts for (first responder, assignee or resolver). */
  agentId: string | null;
  at: string;
  detail: HealthDrillDetail;
}

export interface SupportHealthMetric {
  key: HealthMetricKey;
  level: HealthLevel;
  current: number | null;
  /** The same figure in the previous period; null when there is no history (the queue now). */
  previous: number | null;
  sample: number;
  target: number;
  /** How many more good tickets bring it back to the target; null when already there. */
  toTarget: number | null;
  /** The tickets that count against it, the most recent (or the longest waiting) first. */
  drillDown: HealthDrillItem[];
  drillDownTotal: number;
}

export interface SupportHealth {
  /** The worst level among the metrics that could be measured. */
  level: HealthLevel;
  metrics: SupportHealthMetric[];
  /** Ratings given in the period by stars: index 0 is 1 star, index 4 is 5 stars. */
  ratingCounts: [number, number, number, number, number];
}

export interface SupportPerformanceReport {
  period: SupportPeriod;
  origin: SupportOrigin;
  since: string;
  until: string;
  bucket: SupportBucket;
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
  health: SupportHealth;
  /** Only when the period is a single day. */
  today: SupportToday | null;
}
