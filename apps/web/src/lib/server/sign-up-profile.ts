import { AppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import {
  resolveSignUpProfileKind,
  SIGN_UP_PROFILE_COOKIE,
} from "@sellbridge/shared/sign-up-profile";
import { z } from "zod";
import { isTeamModeOn } from "../../features/auth/team-mode.ts";

/** What the sign-up hook reads from the Better Auth call that created the account. */
export interface AccountCreationCall {
  readonly path: string;
  readonly body: unknown;
  readonly getCookie: (name: string) => string | undefined;
}

export const E_MAIL_SIGN_UP_PATH = "/sign-up/email";
const OAUTH_CALLBACK_PREFIX = "/callback/";
/** Closed to browsers (`auth-route-policy.ts`): only the team invite calls it, from the server. */
const TEAM_INVITE_PATH = "/admin/create-user";
/** The role the invite gives, already checked by the admin plugin and `account-protection.ts`. */
const teamInviteBodySchema = z.object({ role: z.string() });

/**
 * Only a person signing themselves up carries a choice. An account the team creates comes from
 * the team member's browser, whose cookie may hold a choice from their own tests.
 */
export function isSelfSignUpPath(path: string): boolean {
  return path === E_MAIL_SIGN_UP_PATH || path.startsWith(OAUTH_CALLBACK_PREFIX);
}

interface NewUser {
  readonly id: string;
  readonly name: string;
}

interface CreateProfileSteps {
  readonly createOrganization: (input: { userId: string; name: string }) => Promise<{
    id: string;
  }>;
  readonly setOrganizationKind: (organizationId: string, kind: ProfileKind) => Promise<boolean>;
}

/**
 * Attendants and supervisors only work on the team side, so their invite creates no store. An
 * invited admin keeps one, as admins also run a store (`isTeamModeOn` reads the same rule).
 */
function isStorelessTeamInvite(call: AccountCreationCall): boolean {
  if (call.path !== TEAM_INVITE_PATH) {
    return false;
  }
  const parsed = teamInviteBodySchema.safeParse(call.body);
  return parsed.success && isTeamModeOn(parsed.data.role, undefined);
}

function chosenProfileKind(call: AccountCreationCall | null): ProfileKind {
  if (call === null || !isSelfSignUpPath(call.path)) {
    return resolveSignUpProfileKind(undefined);
  }
  return resolveSignUpProfileKind(call.getCookie(SIGN_UP_PROFILE_COOKIE));
}

/**
 * Creates the first profile of a new account, as the seller or supplier the sign-up page chose
 * (`SIGN_UP_PROFILE_COOKIE`). An attendant or supervisor invited by an owner works only in the
 * team panel and gets no profile. An account made by a server call with no request (seed): a
 * seller.
 */
export async function createProfileForNewUser(
  user: NewUser,
  call: AccountCreationCall | null,
  steps: CreateProfileSteps,
): Promise<void> {
  if (call !== null && isStorelessTeamInvite(call)) {
    logger.info("organization.skipped_for_team_member", { userId: user.id });
    return;
  }
  const kind = chosenProfileKind(call);
  const created = await steps.createOrganization({ userId: user.id, name: user.name });
  if (kind === "seller") {
    return;
  }
  const marked = await steps.setOrganizationKind(created.id, kind);
  if (!marked) {
    throw new AppError(
      "NOT_FOUND",
      `Perfil de fornecedor não gravado: organização "${created.id}" não encontrada.`,
    );
  }
  logger.info("organization.marked_as_supplier", { userId: user.id });
}
