import { findImpersonationTarget } from "@sellbridge/database/repositories";
import { getSessionFromCtx } from "better-auth/api";
import { database } from "./database.ts";
import { assertMayImpersonate, visitDetails } from "./impersonation-guard.ts";

/*
 * The database side of a visit to a customer's account, for the auth hooks in `auth.ts`: who may
 * start one (`impersonation-guard.ts`) and what the timeline records when it starts.
 */

type HookContext = Parameters<typeof getSessionFromCtx>[0];

/** Better Auth types the admin plugin's `role` loosely; the rules read it as a string or nothing. */
export function roleOf(user: object): string | null {
  return "role" in user && typeof user.role === "string" ? user.role : null;
}

/**
 * Who may be entered as a customer. Both roles are read fresh from the database, as the plugin
 * does, so a role taken away a minute ago no longer opens accounts.
 */
export async function guardImpersonation(context: HookContext): Promise<void> {
  if (context.path !== "/admin/impersonate-user") {
    return;
  }
  const session = await getSessionFromCtx(context);
  const { internalAdapter } = context.context;
  const findAccount = async (userId: string) => {
    const found = await internalAdapter.findUserById(userId);
    return found === null ? null : { id: found.id, role: roleOf(found) };
  };
  const actor = session === null ? null : await findAccount(session.user.id);
  await assertMayImpersonate(
    { actor, body: context.body },
    { findAccount, findTarget: (userId) => findImpersonationTarget(database, userId) },
  );
}

/** The details of the "Entrou como…" line of a visit that just started. */
export async function startedVisitDetails(impersonatorId: string, userId: string) {
  const [target, impersonator] = await Promise.all([
    findImpersonationTarget(database, userId),
    database.query.user.findFirst({
      where: (account, { eq }) => eq(account.id, impersonatorId),
      columns: { role: true },
    }),
  ]);
  const impersonatorRole = impersonator === undefined ? null : roleOf(impersonator);
  return visitDetails({ impersonatorRole, target });
}
