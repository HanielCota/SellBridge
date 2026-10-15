import { and, eq, isNull, ne, or } from "drizzle-orm";
import type { Database } from "../client.ts";
import { account, session, user } from "../schema/index.ts";

export interface OwnerPromotion {
  /** False when the account already was an admin: nothing changed. */
  promoted: boolean;
  /** Whether a password was dropped, so the owner needs the reset link to set a new one. */
  hadPassword: boolean;
}

/**
 * Makes a verified ADMIN_EMAILS account an admin. Proving the mailbox does not prove who set the
 * sign-in methods: a password or a social login may belong to whoever registered the address
 * first. So the promotion drops every sign-in method and every session in the same transaction;
 * the owner comes back through the reset link or by signing in with Google again.
 */
export async function promoteVerifiedOwner(
  database: Database,
  userId: string,
): Promise<OwnerPromotion> {
  return database.transaction(async (transaction) => {
    const promoted = await transaction
      .update(user)
      .set({ role: "admin" })
      .where(and(eq(user.id, userId), or(isNull(user.role), ne(user.role, "admin"))))
      .returning({ id: user.id });
    if (promoted.length === 0) {
      return { promoted: false, hadPassword: false };
    }
    const dropped = await transaction
      .delete(account)
      .where(eq(account.userId, userId))
      .returning({ providerId: account.providerId });
    await transaction.delete(session).where(eq(session.userId, userId));
    const hadPassword = dropped.some((row) => row.providerId === "credential");
    return { promoted: true, hadPassword };
  });
}
