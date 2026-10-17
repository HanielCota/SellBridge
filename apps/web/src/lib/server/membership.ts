import { schema } from "@sellbridge/database";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { and, asc, eq } from "drizzle-orm";
import { database } from "@/lib/server/database";

/**
 * The kind of the profile while the user still belongs to it, or null when they do not (a member
 * removed keeps an old session, not the profile).
 */
export async function findMemberProfileKind(
  userId: string,
  organizationId: string,
): Promise<ProfileKind | null> {
  const [membership] = await database
    .select({ kind: schema.organization.kind })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)));
  return membership?.kind ?? null;
}

/** Returns the oldest organization the user belongs to, or null when there is none. */
export async function findFirstOrganizationId(userId: string): Promise<string | null> {
  const membership = await database.query.member.findFirst({
    where: eq(schema.member.userId, userId),
    orderBy: asc(schema.member.createdAt),
  });
  if (!membership) {
    return null;
  }
  return membership.organizationId;
}
