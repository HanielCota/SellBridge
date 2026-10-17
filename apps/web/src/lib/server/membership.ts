import { schema } from "@sellbridge/database";
import { asc, eq } from "drizzle-orm";
import { database } from "@/lib/server/database";

export interface Membership {
  organizationId: string;
  /** The profile's name in URLs (`?perfil=`). */
  slug: string;
}

/** Every organization the user belongs to, oldest membership first. */
export async function listMemberships(userId: string): Promise<Membership[]> {
  return database
    .select({ organizationId: schema.member.organizationId, slug: schema.organization.slug })
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
