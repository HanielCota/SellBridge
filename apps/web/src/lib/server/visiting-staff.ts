import { schema } from "@sellbridge/database";
import { eq } from "drizzle-orm";
import { database } from "@/lib/server/database";
import type { VisitingStaff } from "./impersonation-window.ts";

/** The current role and ban of the team member behind a visit, or null when the account is gone. */
export async function findVisitingStaff(userId: string): Promise<VisitingStaff | null> {
  const account = await database.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { role: true, banned: true },
  });
  if (account === undefined) {
    return null;
  }
  return { role: account.role ?? null, banned: account.banned ?? false };
}
