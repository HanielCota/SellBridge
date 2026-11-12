import { and, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { account, session, user } from "../schema/index.ts";

/**
 * A Google sign-in proves the mailbox of an account first registered with e-mail and password, but
 * not who typed that password: it may be whoever registered the address before its owner. The
 * password goes with every session, in one transaction, before the Google session is opened; the
 * owner sets a new password through the reset link if they want one.
 *
 * @returns Whether a password was dropped.
 */
export async function dropEmailSignUpPassword(
  database: Database,
  userId: string,
): Promise<boolean> {
  return database.transaction(async (transaction) => {
    const [owner] = await transaction
      .select({ fromEmailSignUp: user.emailConfirmationRequired })
      .from(user)
      .where(eq(user.id, userId));
    if (owner === undefined || !owner.fromEmailSignUp) {
      return false;
    }
    const dropped = await transaction
      .delete(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    if (dropped.length === 0) {
      return false;
    }
    await transaction.delete(session).where(eq(session.userId, userId));
    return true;
  });
}
