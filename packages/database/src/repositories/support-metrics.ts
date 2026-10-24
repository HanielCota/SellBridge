import { STAFF_ROLES } from "@sellbridge/shared/staff-access";
import type { TicketCategory } from "@sellbridge/shared/ticket-rules";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { ticketEvents, ticketMessages, tickets, user } from "../schema/index.ts";
import { isOverdue, plusResponseTarget } from "./support-deadline.ts";
import { platformTicketSql } from "./support-audience.ts";
import { timestampOf } from "./sql/raw-values.ts";

/*
 * The team's support metrics. Only tickets the team answers count: the conversations between a
 * reseller and their supplier are the supplier's to answer.
 */

export interface SupportMetrics {
  opened: number;
  closed: number;
  openNow: number;
  overdueNow: number;
  /** Average time to the first support reply, for tickets opened in the period. */
  averageFirstResponseMinutes: number | null;
  /**
   * Share of tickets opened in the period whose first reply came within the target. Measured
   * against the ticket's current priority.
   */
  withinTargetRate: number | null;
  /** Every rating given in the period, even if the ticket was reopened afterwards. */
  averageRating: number | null;
  ratings: number;
  byCategory: { category: TicketCategory; total: number }[];
  byAgent: {
    agentId: string;
    agentName: string;
    assignedOpen: number;
    closed: number;
    replies: number;
    averageRating: number | null;
  }[];
}

const firstReplyTarget = plusResponseTarget(tickets.createdAt);

function numberOrNull(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }
  return Number(value);
}

async function overviewMetrics(database: Database, since: Date, now: Date) {
  const openedInPeriod = gte(tickets.createdAt, since);
  const answeredInPeriod = and(openedInPeriod, isNotNull(tickets.firstResponseAt));
  const [row] = await database
    .select({
      opened: sql<number>`count(*) filter (where ${openedInPeriod})`.mapWith(Number),
      closed:
        sql<number>`count(*) filter (where ${tickets.closedAt} >= ${timestampOf(since)})`.mapWith(
          Number,
        ),
      openNow: sql<number>`count(*) filter (where ${tickets.status} = 'open')`.mapWith(Number),
      overdueNow: sql<number>`count(*) filter (where ${isOverdue(now)})`.mapWith(Number),
      averageFirstResponseMinutes: sql<
        string | null
      >`avg(extract(epoch from (${tickets.firstResponseAt} - ${tickets.createdAt})) / 60) filter (where ${answeredInPeriod})`,
      withinTargetRate: sql<
        string | null
      >`avg(case when ${tickets.firstResponseAt} <= ${firstReplyTarget} then 1.0 else 0.0 end) filter (where ${answeredInPeriod})`,
    })
    .from(tickets)
    .where(platformTicketSql);
  return row;
}

/**
 * Ratings come from the history, not from `tickets.rating`: reopening a ticket clears that
 * column for the next close, and a low rating must not vanish from the metrics with it.
 */
const ratingValue = sql`(${ticketEvents.toValue})::int`;
const ratedSince = (since: Date) =>
  and(eq(ticketEvents.type, "rated"), gte(ticketEvents.createdAt, since));

async function ratingMetrics(database: Database, since: Date) {
  const [row] = await database
    .select({ average: sql<string | null>`avg(${ratingValue})`, total: count() })
    .from(ticketEvents)
    .where(ratedSince(since));
  return { average: numberOrNull(row?.average ?? null), total: row?.total ?? 0 };
}

async function agentMetrics(database: Database, since: Date) {
  const replies = database
    .select({ authorId: ticketMessages.authorId, replies: count().as("replies") })
    .from(ticketMessages)
    .where(
      and(
        eq(ticketMessages.isAdmin, true),
        eq(ticketMessages.isInternal, false),
        gte(ticketMessages.createdAt, since),
      ),
    )
    .groupBy(ticketMessages.authorId)
    .as("agent_replies");
  const assigned = database
    .select({
      assigneeId: tickets.assigneeId,
      assignedOpen: sql<number>`count(*) filter (where ${tickets.status} <> 'closed')`.as(
        "assigned_open",
      ),
      closed: sql<number>`count(*) filter (where ${tickets.closedAt} >= ${timestampOf(since)})`.as(
        "closed",
      ),
    })
    .from(tickets)
    .where(isNotNull(tickets.assigneeId))
    .groupBy(tickets.assigneeId)
    .as("agent_tickets");
  // Credited to whoever holds the ticket now.
  const rated = database
    .select({
      assigneeId: tickets.assigneeId,
      averageRating: sql<string | null>`avg(${ratingValue})`.as("average_rating"),
    })
    .from(ticketEvents)
    .innerJoin(tickets, eq(tickets.id, ticketEvents.ticketId))
    .where(and(ratedSince(since), isNotNull(tickets.assigneeId)))
    .groupBy(tickets.assigneeId)
    .as("agent_ratings");
  const rows = await database
    .select({
      agentId: user.id,
      agentName: user.name,
      assignedOpen: sql<number>`coalesce(${assigned.assignedOpen}, 0)`.mapWith(Number),
      closed: sql<number>`coalesce(${assigned.closed}, 0)`.mapWith(Number),
      replies: sql<number>`coalesce(${replies.replies}, 0)`.mapWith(Number),
      averageRating: rated.averageRating,
    })
    .from(user)
    .leftJoin(assigned, eq(assigned.assigneeId, user.id))
    .leftJoin(replies, eq(replies.authorId, user.id))
    .leftJoin(rated, eq(rated.assigneeId, user.id))
    .where(inArray(user.role, [...STAFF_ROLES]))
    .orderBy(asc(user.name));
  return rows.map((row) => ({ ...row, averageRating: numberOrNull(row.averageRating) }));
}

/** Volume, response times and satisfaction since `since`, overall and per team member. */
export async function getSupportMetrics(
  database: Database,
  input: { since: Date; now?: Date },
): Promise<SupportMetrics> {
  const now = input.now ?? new Date();
  const [overview, ratings, byCategory, byAgent] = await Promise.all([
    overviewMetrics(database, input.since, now),
    ratingMetrics(database, input.since),
    database
      .select({ category: tickets.category, total: count() })
      .from(tickets)
      .where(and(platformTicketSql, gte(tickets.createdAt, input.since)))
      .groupBy(tickets.category)
      .orderBy(desc(count())),
    agentMetrics(database, input.since),
  ]);
  return {
    opened: overview?.opened ?? 0,
    closed: overview?.closed ?? 0,
    openNow: overview?.openNow ?? 0,
    overdueNow: overview?.overdueNow ?? 0,
    averageFirstResponseMinutes: numberOrNull(overview?.averageFirstResponseMinutes ?? null),
    withinTargetRate: numberOrNull(overview?.withinTargetRate ?? null),
    averageRating: ratings.average,
    ratings: ratings.total,
    byCategory,
    byAgent,
  };
}
