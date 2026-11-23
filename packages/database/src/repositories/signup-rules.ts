import { eq } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import { platformSettings } from "../schema/index.ts";

/** Since when the contract sign-up rules apply; null while the admin keeps them off. */
export async function getSignupRulesSince(database: DatabaseExecutor): Promise<Date | null> {
  const [row] = await database
    .select({ since: platformSettings.signupRulesSince })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1));
  return row?.since ?? null;
}

/**
 * Switches the contract sign-up rules on or off; a switch already on keeps the instant it was
 * turned on, since the deadlines of suppliers already signed up count from it.
 */
export async function setSignupRules(
  database: Database,
  input: { enabled: boolean; userId: string; now: Date },
): Promise<Date | null> {
  return database.transaction(async (transaction) => {
    const current = await getSignupRulesSince(transaction);
    const since = input.enabled ? (current ?? input.now) : null;
    const values = { signupRulesSince: since, updatedByUserId: input.userId, updatedAt: input.now };
    await transaction
      .insert(platformSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: platformSettings.id, set: values });
    return since;
  });
}
