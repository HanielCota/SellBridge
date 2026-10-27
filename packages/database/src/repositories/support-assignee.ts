import { isStaffRole, STAFF_ROLES } from "@sellbridge/shared/staff-access";
import { eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../client.ts";
import { tickets, user } from "../schema/index.ts";

/** The ticket's assignee, joined under its own name next to the requester's `user` row. */
export const assignee = alias(user, "assignee");

export const STAFF_ROLE_LIST = sql.raw(STAFF_ROLES.map((role) => `'${role}'`).join(", "));

/**
 * The ticket has nobody active in charge: no assignee, or one who left the team (role changed
 * or account blocked). Those tickets go back to the queue instead of sitting in a dead inbox.
 */
export const withoutActiveAssigneeSql = sql`("tickets"."assignee_id" is null or not exists (
  select 1 from "user" team_u
  where team_u.id = "tickets"."assignee_id"
    and team_u.role in (${STAFF_ROLE_LIST})
    and not coalesce(team_u.banned, false)
))`;

/** Who the screens show in charge: nobody when the assignee left the team, like the queues. */
export const activeAssigneeIdSql = sql<
  string | null
>`case when ${withoutActiveAssigneeSql} then null else ${tickets.assigneeId} end`;
export const activeAssigneeNameSql = sql<
  string | null
>`case when ${withoutActiveAssigneeSql} then null else ${assignee.name} end`;

/** Whether `userId` is on the support team now: a staff role and not blocked. */
export async function isActiveStaff(executor: DatabaseExecutor, userId: string): Promise<boolean> {
  const [row] = await executor
    .select({ role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row !== undefined && isStaffRole(row.role) && row.banned !== true;
}
