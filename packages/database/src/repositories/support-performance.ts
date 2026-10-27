import { STAFF_ROLES, staffRoleOf } from "@sellbridge/shared/staff-access";
import {
  CAME_BACK_WINDOW_DAYS,
  type OpenedTicketRow,
  type QueueRow,
  type RatingRow,
  type ResolutionRow,
  type StaffRow,
  type SupportPerformanceRows,
  type TeamReplyRow,
} from "@sellbridge/shared/support-performance";
import { and, eq, gte, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  organization,
  ticketEvents,
  ticketMessages,
  ticketOrders,
  tickets,
  user,
} from "../schema/index.ts";
import { activeAssigneeIdSql, assignee } from "./support-assignee.ts";
import { platformTicketSql } from "./support-audience.ts";
import { isOverdue } from "./support-deadline.ts";

/*
 * Raw rows for the support performance report (`@sellbridge/shared/support-performance` turns
 * them into figures). Only tickets the team answers count. Volumes are small (hundreds a month),
 * so the rules stay in tested TypeScript; move the aggregation into SQL if that changes.
 */

const publicTeamReply = sql`m.is_admin and not m.is_internal`;

/** Author of the first public team reply on the ticket. */
const firstResponderSql = sql<string | null>`(
  select m.author_id from ${ticketMessages} m
  where m.ticket_id = ${tickets.id} and ${publicTeamReply}
  order by m.created_at asc limit 1
)`;

/**
 * Author of the last public team reply up to the close at `moment`, counting only replies after
 * the ticket's previous close: when a reopened ticket is closed again with no new reply, nobody
 * earns that second close (and the one who failed the first does not get it back).
 */
function lastTeamReplierUpTo(moment: SQL) {
  return sql<string | null>`(
    select m.author_id from ${ticketMessages} m
    where m.ticket_id = ${tickets.id} and ${publicTeamReply} and m.created_at <= ${moment}
      and m.created_at > coalesce((
        select max(p.created_at) from ${ticketEvents} p
        where p.ticket_id = ${tickets.id} and p.type = 'status_changed'
          and p.to_value = 'closed' and p.created_at < ${moment}
      ), '-infinity'::timestamptz)
    order by m.created_at desc limit 1
  )`;
}

const comeBackWindow = sql.raw(`interval '${CAME_BACK_WINDOW_DAYS} days'`);

/**
 * The new ticket is about the same thing as the closed one: the same store, the same listing or
 * a shared order. Without that, a second "pedido atrasou" can be a different order and must
 * not count against whoever solved the first.
 */
const sameReferenceSql = sql`(
  (n.store_connection_id is not null and n.store_connection_id = ${tickets.storeConnectionId})
  or (n.listing_id is not null and n.listing_id = ${tickets.listingId})
  or exists (
    select 1 from ${ticketOrders} closed_order
    join ${ticketOrders} new_order on new_order.order_id = closed_order.order_id
    where closed_order.ticket_id = ${tickets.id} and new_order.ticket_id = n.id
  )
)`;

/**
 * The close came back: reopened within the window, or the same customer opened the same
 * complaint (topic and situation) about the same thing again.
 */
const cameBackSql = sql<boolean>`(
  exists (
    select 1 from ${ticketEvents} r
    where r.ticket_id = ${ticketEvents.ticketId} and r.type = 'status_changed'
      and r.from_value = 'closed' and r.created_at > ${ticketEvents.createdAt}
      and r.created_at <= ${ticketEvents.createdAt} + ${comeBackWindow}
  )
  or (${tickets.situationId} is not null and exists (
    select 1 from ${tickets} n
    where n.tenant_id = ${tickets.tenantId} and n.category = ${tickets.category}
      and n.situation_id = ${tickets.situationId} and n.id <> ${tickets.id}
      and n.audience = 'platform' and n.created_at > ${ticketEvents.createdAt}
      and n.created_at <= ${ticketEvents.createdAt} + ${comeBackWindow}
      and ${sameReferenceSql}
  ))
)`;

/** The last close of the ticket at or before the rating: the one the customer judged. */
const ratedCloseSql = sql`(
  select max(c.created_at) from ${ticketEvents} c
  where c.ticket_id = ${ticketEvents.ticketId} and c.type = 'status_changed'
    and c.to_value = 'closed' and c.created_at <= ${ticketEvents.createdAt}
)`;

const subjectColumns = {
  ticketId: tickets.id,
  origin: organization.kind,
  category: tickets.category,
  situationId: tickets.situationId,
};

async function openedRows(database: Database, since: Date): Promise<OpenedTicketRow[]> {
  return database
    .select({
      ...subjectColumns,
      tenantId: tickets.tenantId,
      priority: tickets.priority,
      createdAt: tickets.createdAt,
      firstResponseAt: tickets.firstResponseAt,
      firstResponderId: firstResponderSql,
    })
    .from(tickets)
    .innerJoin(organization, eq(organization.id, tickets.tenantId))
    .where(and(platformTicketSql, gte(tickets.createdAt, since)));
}

async function resolutionRows(database: Database, since: Date): Promise<ResolutionRow[]> {
  return database
    .select({
      ...subjectColumns,
      openedAt: tickets.createdAt,
      closedAt: ticketEvents.createdAt,
      resolverId: lastTeamReplierUpTo(sql`${ticketEvents.createdAt}`),
      cameBack: cameBackSql,
    })
    .from(ticketEvents)
    .innerJoin(tickets, eq(tickets.id, ticketEvents.ticketId))
    .innerJoin(organization, eq(organization.id, tickets.tenantId))
    .where(
      and(
        platformTicketSql,
        eq(ticketEvents.type, "status_changed"),
        eq(ticketEvents.toValue, "closed"),
        gte(ticketEvents.createdAt, since),
      ),
    );
}

async function ratingRows(database: Database, since: Date): Promise<RatingRow[]> {
  return database
    .select({
      ...subjectColumns,
      ratedAt: ticketEvents.createdAt,
      rating: sql<number>`(${ticketEvents.toValue})::int`.mapWith(Number),
      // The column holds the latest rating's comment: only shown for that same rating.
      comment: sql<
        string | null
      >`case when ${tickets.ratedAt} = ${ticketEvents.createdAt} then ${tickets.ratingComment} end`,
      resolverId: lastTeamReplierUpTo(ratedCloseSql),
      ratedCloseAt: sql<Date | null>`${ratedCloseSql}`.mapWith(ticketEvents.createdAt),
    })
    .from(ticketEvents)
    .innerJoin(tickets, eq(tickets.id, ticketEvents.ticketId))
    .innerJoin(organization, eq(organization.id, tickets.tenantId))
    .where(
      and(platformTicketSql, eq(ticketEvents.type, "rated"), gte(ticketEvents.createdAt, since)),
    );
}

async function replyRows(database: Database, since: Date): Promise<TeamReplyRow[]> {
  return database
    .select({
      authorId: ticketMessages.authorId,
      origin: organization.kind,
      createdAt: ticketMessages.createdAt,
    })
    .from(ticketMessages)
    .innerJoin(tickets, eq(tickets.id, ticketMessages.ticketId))
    .innerJoin(organization, eq(organization.id, tickets.tenantId))
    .where(
      and(
        platformTicketSql,
        eq(ticketMessages.isAdmin, true),
        eq(ticketMessages.isInternal, false),
        gte(ticketMessages.createdAt, since),
      ),
    );
}

async function queueRows(database: Database, now: Date): Promise<QueueRow[]> {
  return database
    .select({
      ...subjectColumns,
      // The same rule as the queue: a blocked or removed assignee counts as nobody.
      assigneeId: activeAssigneeIdSql,
      awaitingSince: tickets.awaitingSince,
      overdue: sql<boolean>`${isOverdue(now)}`,
    })
    .from(tickets)
    .innerJoin(organization, eq(organization.id, tickets.tenantId))
    .leftJoin(assignee, eq(assignee.id, tickets.assigneeId))
    .where(and(platformTicketSql, ne(tickets.status, "closed")));
}

async function staffRows(database: Database): Promise<StaffRow[]> {
  const rows = await database
    .select({
      id: user.id,
      name: user.name,
      role: user.role,
      joinedAt: user.createdAt,
      banned: user.banned,
    })
    .from(user)
    .where(inArray(user.role, [...STAFF_ROLES]));
  return rows.flatMap((row) => {
    const role = staffRoleOf(row.role);
    return role === null ? [] : [{ ...row, role, banned: row.banned === true }];
  });
}

/**
 * Everything the report needs: tickets, closes and ratings since `previousSince` (the start of
 * the previous period, for the comparisons), and team replies since `since` only.
 */
export async function getSupportPerformanceRows(
  database: Database,
  input: { previousSince: Date; since: Date; now: Date },
): Promise<SupportPerformanceRows> {
  const [opened, resolutions, ratings, replies, queue, staff] = await Promise.all([
    openedRows(database, input.previousSince),
    resolutionRows(database, input.previousSince),
    ratingRows(database, input.previousSince),
    replyRows(database, input.since),
    queueRows(database, input.now),
    staffRows(database),
  ]);
  return { opened, resolutions, ratings, replies, queue, staff };
}
