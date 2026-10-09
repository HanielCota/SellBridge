import { schema } from "@sellbridge/database";
import { asc, eq } from "drizzle-orm";
import { database } from "./database.ts";

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
