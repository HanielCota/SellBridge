import {
  findAccountByEmail,
  listStaffMembers,
  recordAdminEvent,
} from "@sellbridge/database/repositories";
import {
  conflictError,
  forbiddenError,
  isAppError,
  notFoundError,
} from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { isPlatformOwner, type AccountIdentity } from "@sellbridge/shared/platform-owner";
import { inviteTeamMemberSchema, type InviteTeamMemberInput } from "@sellbridge/shared/schemas";
import type { StaffRole } from "@sellbridge/shared/staff-access";
import { planTeamInvite } from "@sellbridge/shared/team-invite";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { adminMiddleware } from "@/lib/server/middleware";

const memberIdSchema = z.object({ userId: z.string().min(1).max(64) });

const NOT_OWNER_MESSAGE = "Só um dono da plataforma convida e muda a equipe";

/** Bringing someone into the team is managing the team: owners only (`platform-owner.ts`). */
function requireOwner(actor: AccountIdentity): void {
  if (!isPlatformOwner(actor, environment.ADMIN_EMAILS)) {
    throw forbiddenError(NOT_OWNER_MESSAGE);
  }
}

/**
 * Better Auth refuses with its own errors (two invites to one address at once, a guard); the
 * screen gets a clear sentence instead of the generic failure.
 */
function inviteError(error: unknown): unknown {
  if (isAppError(error) || !(error instanceof APIError)) {
    return error;
  }
  if (error.body?.code === "USER_ALREADY_EXISTS") {
    return conflictError("Já existe uma conta com este e-mail. Atualize a página e tente de novo");
  }
  return conflictError("Não foi possível concluir o convite. Tente de novo em instantes");
}

/** A password nobody knows: the person creates their own through the invite link. */
function unusablePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

/** The set-password link; auth.ts words it as an invitation for a pending team member. */
async function sendInviteLink(email: string): Promise<void> {
  await auth.api.requestPasswordReset({ body: { email, redirectTo: "/redefinir-senha" } });
}

async function setTeamRole(userId: string, role: StaffRole): Promise<void> {
  await auth.api.setRole({ body: { userId, role }, headers: getRequestHeaders() });
}

/**
 * Creates the account, gives the role and sends the link. Every new account is born a reseller
 * (auth.ts databaseHooks), so the role comes after; if that or the e-mail fails, the account
 * is removed, so a retry starts clean instead of finding a half-made account.
 */
async function createInvitedAccount(adminId: string, data: InviteTeamMemberInput): Promise<void> {
  const created = await auth.api.createUser({
    body: {
      email: data.email,
      name: data.name,
      password: unusablePassword(),
      // Only an owner invites, and the link itself goes to the mailbox.
      data: { emailVerified: true },
    },
    headers: getRequestHeaders(),
  });
  const userId = created.user.id;
  try {
    await setTeamRole(userId, data.role);
    await sendInviteLink(data.email);
  } catch (error) {
    logger.error("admin.team_invite_rolled_back", { adminId, userId, error });
    await auth.api.removeUser({ body: { userId }, headers: getRequestHeaders() });
    throw error;
  }
  await recordAdminEvent(database, {
    adminId,
    userId,
    action: "team_invited",
    details: { role: data.role },
  });
  logger.info("admin.team_invited", { adminId, userId });
}

async function inviteTeamMember(adminId: string, data: InviteTeamMemberInput) {
  const existing = await findAccountByEmail(database, data.email);
  const plan = planTeamInvite(data.email, existing, data.role, environment.ADMIN_EMAILS);
  if (plan.kind === "refuse") {
    throw conflictError(plan.reason);
  }
  if (plan.kind === "create") {
    await createInvitedAccount(adminId, data);
    return { status: "invited" as const };
  }
  await setTeamRole(plan.userId, data.role);
  await recordAdminEvent(database, {
    adminId,
    userId: plan.userId,
    action: "role_changed",
    details: { role: data.role, from: plan.previousRole },
  });
  logger.info("admin.team_role_changed", { adminId, userId: plan.userId });
  return { status: "promoted" as const };
}

export const adminListTeam = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async ({ context }) => ({
    members: await listStaffMembers(database),
    canInvite: isPlatformOwner(context.actor, environment.ADMIN_EMAILS),
    viewerId: context.userId,
  }));

/**
 * Invites a person into the team with a role (item 28.a): a new address gets an account and
 * a link to create the password; someone already on the team gets the new role.
 */
export const adminInviteTeamMember = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(inviteTeamMemberSchema)
  .handler(async ({ context, data }) => {
    requireOwner(context.actor);
    try {
      return await inviteTeamMember(context.userId, data);
    } catch (error) {
      throw inviteError(error);
    }
  });

/** A new link for someone invited who never came in (the first one lasts an hour). */
export const adminResendTeamInvite = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(memberIdSchema)
  .handler(async ({ context, data }) => {
    requireOwner(context.actor);
    const member = (await listStaffMembers(database)).find((row) => row.id === data.userId);
    if (member === undefined) {
      throw notFoundError("Pessoa não encontrada na equipe");
    }
    if (member.lastSeenAt !== null) {
      throw conflictError("Esta pessoa já entrou no SellBridge; use Redefinir senha na ficha");
    }
    await sendInviteLink(member.email);
    await recordAdminEvent(database, {
      adminId: context.userId,
      userId: member.id,
      action: "team_invited",
      details: { role: member.role, resent: true },
    });
    logger.info("admin.team_invite_resent", { adminId: context.userId, userId: member.id });
    return { ok: true };
  });
