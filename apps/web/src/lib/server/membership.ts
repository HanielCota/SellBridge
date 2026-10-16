import { schema } from "@sellbridge/database";
import { and, asc, eq } from "drizzle-orm";
import { database } from "@/lib/server/database";

/** Whether the user still belongs to the organization (a member removed keeps an old session). */
export async function isMemberOf(userId: string, organizationId: string): Promise<boolean> {
  const membership = await database.query.member.findFirst({
    where: and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)),
    columns: { id: true },
  });
  return membership !== undefined;
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
