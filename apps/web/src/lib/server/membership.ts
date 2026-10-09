import { schema } from "@sellbridge/db";
import { asc, eq } from "drizzle-orm";
import { db } from "./db.ts";

/** Returns the oldest organization the user belongs to, or null when there is none. */
export async function findFirstOrganizationId(userId: string): Promise<string | null> {
  const membership = await db.query.member.findFirst({
    where: eq(schema.member.userId, userId),
    orderBy: asc(schema.member.createdAt),
  });
  if (!membership) {
    return null;
  }
  return membership.organizationId;
}
