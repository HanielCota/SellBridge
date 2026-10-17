import { schema } from "@sellbridge/database";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { asc, eq } from "drizzle-orm";
import { database } from "@/lib/server/database";

export interface Membership {
  organizationId: string;
  /** The profile's name in URLs (`?perfil=`). */
  slug: string;
  /** Seller or supplier (`organization.kind`). */
  kind: ProfileKind;
}

/**
 * Every organization the user belongs to, oldest membership first. A member removed keeps an old
 * session, not the profile: it simply is no longer in this list.
 */
export async function listMemberships(userId: string): Promise<Membership[]> {
  return database
    .select({
      organizationId: schema.member.organizationId,
      slug: schema.organization.slug,
      kind: schema.organization.kind,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(eq(schema.member.userId, userId))
    .orderBy(asc(schema.member.createdAt));
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
