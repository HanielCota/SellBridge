import { notFoundError } from "@sellbridge/shared/errors";
import { auth } from "@/lib/server/auth";
import { environment } from "@/lib/server/environment";
import { isDeveloperSession } from "./developer-access";

function impersonatorOf(session: object): string | null {
  if (!("impersonatedBy" in session)) {
    return null;
  }
  const { impersonatedBy } = session;
  return typeof impersonatedBy === "string" && impersonatedBy.length > 0 ? impersonatedBy : null;
}

/** The signed-in developer's user id, or null for anyone else (signed out included). */
export async function findDeveloperUserId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  if (session === null) {
    return null;
  }
  const { id, email, emailVerified, banned } = session.user;
  const allowed = isDeveloperSession(
    {
      account: { email, emailVerified, banned: banned === true },
      impersonatedBy: impersonatorOf(session.session),
    },
    environment.DEVELOPER_EMAILS,
  );
  return allowed ? id : null;
}

/**
 * Requires a developer; anyone else gets "not found", so the feature's existence is not
 * revealed to admins or customers.
 */
export async function requireDeveloperSession(headers: Headers): Promise<{ userId: string }> {
  const userId = await findDeveloperUserId(headers);
  if (userId === null) {
    throw notFoundError("Página não encontrada");
  }
  return { userId };
}
