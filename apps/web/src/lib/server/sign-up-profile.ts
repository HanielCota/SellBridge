import { AppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  resolveSignUpProfileKind,
  SIGN_UP_PROFILE_COOKIE,
  type SignUpProfileKind,
} from "@sellbridge/shared/sign-up-profile";

/** What the sign-up hook reads from the request that created the account. */
export interface SignUpRequest {
  readonly getCookie: (name: string) => string | undefined;
}

const E_MAIL_SIGN_UP_PATH = "/sign-up/email";
const OAUTH_CALLBACK_PREFIX = "/callback/";

/**
 * Only a person signing themselves up carries a choice. An account the team creates
 * (`/admin/create-user`, team invites) comes from the team member's browser, whose cookie may
 * hold a choice from their own tests: that account stays a seller.
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
  readonly setOrganizationKind: (
    organizationId: string,
    kind: SignUpProfileKind,
  ) => Promise<boolean>;
}

/**
 * Creates the first profile of a new account, as the seller or supplier the sign-up page chose
 * (`SIGN_UP_PROFILE_COOKIE`). An account made by a server call (seed, team invite) has no
 * request: a seller.
 */
export async function createProfileForNewUser(
  user: NewUser,
  request: SignUpRequest | null,
  steps: CreateProfileSteps,
): Promise<SignUpProfileKind> {
  const kind = resolveSignUpProfileKind(
    request === null ? undefined : request.getCookie(SIGN_UP_PROFILE_COOKIE),
  );
  const created = await steps.createOrganization({ userId: user.id, name: user.name });
  if (kind === "seller") {
    return kind;
  }
  const marked = await steps.setOrganizationKind(created.id, kind);
  if (!marked) {
    throw new AppError(
      "NOT_FOUND",
      `Perfil de fornecedor não gravado: organização "${created.id}" não encontrada.`,
    );
  }
  logger.info("organization.marked_as_supplier", { userId: user.id });
  return kind;
}
