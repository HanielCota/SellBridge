import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { STAFF_ROLES } from "@sellbridge/shared/staff-access";
import { and, asc, desc, eq, inArray, ne, notExists, or } from "drizzle-orm";
import type { Database } from "../client.ts";
import { member, organization, ticketEvents, tickets, user } from "../schema/index.ts";

export interface ImpersonationTarget {
  /**
   * The latest ticket not closed of the account or of a profile it belongs to, leaving out
   * tickets the team reopened after they were closed.
   */
  openTicketId: string | null;
  /** The kind of the account's first profile: a supplier visit opens on the supplier panel. */
  profileKind: ProfileKind | null;
}

async function latestOpenTicketId(database: Database, userId: string): Promise<string | null> {
  const profiles = database
    .select({ id: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));
  // A ticket the team itself reopened would let any agent open the door on their own.
  const reopenedByTeam = database
    .select({ id: ticketEvents.id })
    .from(ticketEvents)
    .innerJoin(user, eq(user.id, ticketEvents.actorId))
    .where(
      and(
        eq(ticketEvents.ticketId, tickets.id),
        eq(ticketEvents.type, "status_changed"),
        eq(ticketEvents.fromValue, "closed"),
        inArray(user.role, [...STAFF_ROLES]),
      ),
    );
  const [ticket] = await database
    .select({ id: tickets.id })
    .from(tickets)
    .where(
      and(
        ne(tickets.status, "closed"),
        or(eq(tickets.createdById, userId), inArray(tickets.tenantId, profiles)),
        notExists(reopenedByTeam),
      ),
    )
    .orderBy(desc(tickets.updatedAt))
    .limit(1);
  return ticket?.id ?? null;
}

async function firstProfileKind(database: Database, userId: string): Promise<ProfileKind | null> {
  const [profile] = await database
    .select({ kind: organization.kind })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(1);
  return profile?.kind ?? null;
}

/** What the server needs to decide on, and then record, a visit to this account. */
export async function findImpersonationTarget(
  database: Database,
  userId: string,
): Promise<ImpersonationTarget> {
  const [openTicketId, profileKind] = await Promise.all([
    latestOpenTicketId(database, userId),
    firstProfileKind(database, userId),
  ]);
  return { openTicketId, profileKind };
}
