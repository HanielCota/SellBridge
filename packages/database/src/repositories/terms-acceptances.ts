import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { termsAcceptances } from "../schema/index.ts";

/** Records that the person accepted `version` of the terms; accepting twice keeps the first date. */
export async function recordTermsAcceptance(
  database: DatabaseExecutor,
  userId: string,
  version: string,
): Promise<void> {
  await database.insert(termsAcceptances).values({ userId, version }).onConflictDoNothing();
}

export async function hasAcceptedTerms(
  database: DatabaseExecutor,
  userId: string,
  version: string,
): Promise<boolean> {
  const [row] = await database
    .select({ id: termsAcceptances.id })
    .from(termsAcceptances)
    .where(and(eq(termsAcceptances.userId, userId), eq(termsAcceptances.version, version)))
    .limit(1);
  return row !== undefined;
}
