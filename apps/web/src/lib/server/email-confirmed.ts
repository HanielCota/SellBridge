import { isUserEmailVerified } from "@sellbridge/database/repositories";
import { forbiddenError } from "@sellbridge/shared/errors";
import { database } from "@/lib/server/database";

/**
 * Credentials that outlive a session (API keys, webhook endpoints) need a confirmed e-mail.
 * Anyone can sign up with someone else's address and is signed in at once; a key made then
 * would keep reading the workspace after the real owner recovers the account by password reset,
 * which ends sessions only.
 */
export async function assertEmailConfirmed(userId: string, action: string): Promise<void> {
  if (await isUserEmailVerified(database, userId)) {
    return;
  }

  throw forbiddenError(`Confirme seu e-mail antes de ${action}.`);
}
