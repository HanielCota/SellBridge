import { randomBytes } from "node:crypto";
import {
  findAccountByEmail,
  listStaffMembers,
  recordAdminEvent,
} from "@sellbridge/database/repositories";
import { conflictError, forbiddenError, notFoundError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { isPlatformOwner, type AccountIdentity } from "@sellbridge/shared/platform-owner";
import { inviteTeamMemberSchema } from "@sellbridge/shared/schemas";
import { planTeamInvite } from "@sellbridge/shared/team-invite";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { adminMiddleware } from "@/lib/server/middleware";
import { TEAM_INVITE_CALLBACK } from "./team-invite-email";

const memberIdSchema = z.object({ userId: z.string().min(1).max(64) });

const NOT_OWNER_MESSAGE = "Só um dono da plataforma convida e muda a equipe";

/** Bringing someone into the team is managing the team: owners only (`platform-owner.ts`). */
function requireOwner(actor: AccountIdentity): void {
  if (!isPlatformOwner(actor, environment.ADMIN_EMAILS)) {
    throw forbiddenError(NOT_OWNER_MESSAGE);
  }
}

/** The set-password link, worded as an invitation (auth.ts reads the callback). */
async function sendInviteLink(email: string): Promise<void> {
  await auth.api.requestPasswordReset({ body: { email, redirectTo: TEAM_INVITE_CALLBACK } });
}

export const adminListTeam = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async ({ context }) => ({
    members: await listStaffMembers(database),
    canInvite: isPlatformOwner(context.actor, environment.ADMIN_EMAILS),
    viewerId: context.userId,
  }));

/**
 * Invites a person into the team with a role: a new address gets an account (no usable
 * password) and a link to create one; an existing account just gets the role.
 */
export const adminInviteTeamMember = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(inviteTeamMemberSchema)
  .handler(async ({ context, data }) => {
    requireOwner(context.actor);
    const existing = await findAccountByEmail(database, data.email);
    const plan = planTeamInvite(existing, data.role, environment.ADMIN_EMAILS);
    if (plan.kind === "refuse") {
      throw conflictError(plan.reason);
    }
    if (plan.kind === "promote") {
      await auth.api.setRole({
        body: { userId: plan.userId, role: data.role },
        headers: getRequestHeaders(),
      });
      await recordAdminEvent(database, {
        adminId: context.userId,
        userId: plan.userId,
        action: "role_changed",
        details: { role: data.role },
      });
      logger.info("admin.team_role_given", { adminId: context.userId, userId: plan.userId });
      return { status: "promoted" as const };
    }
    const created = await auth.api.createUser({
      body: {
        email: data.email,
        name: data.name,
        // Nobody knows it: the person sets their own through the invite link.
        password: randomBytes(32).toString("base64url"),
        // Only an owner invites, and the link itself goes to the mailbox.
        data: { emailVerified: true },
      },
      headers: getRequestHeaders(),
    });
    // Every new account is born a reseller (auth.ts databaseHooks): the role comes after.
    await auth.api.setRole({
      body: { userId: created.user.id, role: data.role },
      headers: getRequestHeaders(),
    });
    await sendInviteLink(data.email);
    await recordAdminEvent(database, {
      adminId: context.userId,
      userId: created.user.id,
      action: "team_invited",
      details: { role: data.role },
    });
    logger.info("admin.team_invited", { adminId: context.userId, userId: created.user.id });
    return { status: "invited" as const };
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
    return { ok: true };
  });
