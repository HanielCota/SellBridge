import {
  type AccountIdentity,
  canManageAccount,
  isPlatformOwner,
} from "@sellbridge/shared/platform-owner";
import { APIError } from "better-auth/api";
import { z } from "zod";

/** How the guard finds the account a plugin route acts on. */
export interface AccountDirectory {
  findAccount(userId: string): Promise<AccountIdentity | null>;
  /** The user a session token belongs to (`/admin/revoke-user-session` names a session). */
  findSessionUserId(sessionToken: string): Promise<string | null>;
}

export interface AccountActionRequest {
  path: string;
  body: unknown;
  /** Who is calling; null without a session (the plugin refuses that itself). */
  actor: AccountIdentity | null;
}

/**
 * The admin plugin's routes that create, change, expose or enter another account. Each one goes
 * through `assertMayActOnAccount`, whether called over HTTP or by the app's own server functions.
 */
export const ACCOUNT_ACTION_PATHS: ReadonlySet<string> = new Set([
  "/admin/create-user",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/remove-user",
  "/admin/update-user",
  "/admin/impersonate-user",
  "/admin/list-user-sessions",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
]);

export const PROTECTED_ACCOUNT_MESSAGE = "Só um dono da plataforma altera contas da equipe";

type AccountState = Pick<AccountIdentity, "email" | "role">;

/** A body the plugin may accept in a shape the guard cannot read: only an owner gets through. */
const UNREADABLE = "unreadable";

/** The plugin coerces `userId` to a string; the guard reads it the same way. */
const userTargetSchema = z.object({ userId: z.coerce.string().min(1) });
const sessionTargetSchema = z.object({ sessionToken: z.string().min(1) });
/** The plugin takes one role or a list, stored as "user,admin". */
const roleSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((role) => (Array.isArray(role) ? role.join(",") : role));
const setRoleSchema = z.object({ role: roleSchema });
const changesSchema = z.object({
  /** The plugin stores `String(email)`: a list of one address is that address. */
  email: z.coerce.string().optional(),
  role: roleSchema.optional(),
});
const updateUserSchema = z.object({ data: changesSchema });
const createUserSchema = z.object({
  email: z.coerce.string(),
  role: roleSchema.optional(),
  data: changesSchema.omit({ email: true }).optional(),
});

/** The account a route names, or null when the body names none (the plugin rejects it). */
async function targetUserId(
  request: Pick<AccountActionRequest, "path" | "body">,
  directory: AccountDirectory,
): Promise<string | null> {
  if (request.path === "/admin/create-user") {
    return null;
  }
  if (request.path === "/admin/revoke-user-session") {
    const parsed = sessionTargetSchema.safeParse(request.body);
    return parsed.success ? directory.findSessionUserId(parsed.data.sessionToken) : null;
  }
  const parsed = userTargetSchema.safeParse(request.body);
  return parsed.success ? parsed.data.userId : null;
}

/**
 * The account as the route would leave it: a new role, a new e-mail or a new account. Null when
 * the route changes neither (ban, sessions, password) or names no existing account.
 */
function requestedState(
  request: Pick<AccountActionRequest, "path" | "body">,
  current: AccountState | null,
): AccountState | null | typeof UNREADABLE {
  if (request.path === "/admin/create-user") {
    const parsed = createUserSchema.safeParse(request.body);
    return parsed.success
      ? { email: parsed.data.email, role: parsed.data.role ?? parsed.data.data?.role }
      : UNREADABLE;
  }
  if (current === null) {
    return null;
  }
  if (request.path === "/admin/set-role") {
    const parsed = setRoleSchema.safeParse(request.body);
    return parsed.success ? { email: current.email, role: parsed.data.role } : UNREADABLE;
  }
  if (request.path === "/admin/update-user") {
    const parsed = updateUserSchema.safeParse(request.body);
    return parsed.success
      ? {
          email: parsed.data.data.email ?? current.email,
          role: parsed.data.data.role ?? current.role,
        }
      : UNREADABLE;
  }
  return null;
}

/**
 * Refuses an ordinary admin acting on an owner or on the team, and turning an account into one
 * of them (a team role, an owner's address): see `canManageAccount`.
 */
export async function assertMayActOnAccount(
  request: AccountActionRequest,
  directory: AccountDirectory,
  ownerEmails: readonly string[],
): Promise<void> {
  const { actor } = request;
  if (!ACCOUNT_ACTION_PATHS.has(request.path) || actor === null) {
    return;
  }
  const userId = await targetUserId(request, directory);
  const current = userId === null ? null : await directory.findAccount(userId);
  const requested = requestedState(request, current);
  if (requested === UNREADABLE) {
    if (isPlatformOwner(actor, ownerEmails)) {
      return;
    }
    throw new APIError("FORBIDDEN", { message: PROTECTED_ACCOUNT_MESSAGE });
  }
  const touched = [current, requested].filter((state) => state !== null);
  if (touched.every((state) => canManageAccount(actor, state, ownerEmails))) {
    return;
  }
  throw new APIError("FORBIDDEN", { message: PROTECTED_ACCOUNT_MESSAGE });
}
