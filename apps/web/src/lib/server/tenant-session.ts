import { ForbiddenError, UnauthorizedError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { auth } from "./auth.ts";
import { findFirstOrganizationId } from "./membership.ts";

export interface TenantSession {
  tenantId: string;
  userId: string;
  role: string;
}

/**
 * Resolves the authenticated user and tenant from request headers.
 * Sessions created during sign-up may exist before the organization does, so it
 * falls back to the user's first organization and stores it as the active one.
 */
export async function requireTenantSession(headers: Headers): Promise<TenantSession> {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw new UnauthorizedError();
  }
  const base = { userId: session.user.id, role: session.user.role ?? "user" };
  const activeId = session.session.activeOrganizationId;
  if (activeId) {
    return { ...base, tenantId: activeId };
  }
  const organizationId = await findFirstOrganizationId(session.user.id);
  if (!organizationId) {
    throw new ForbiddenError("Sua conta não possui uma organização ativa");
  }
  await auth.api
    .setActiveOrganization({ headers, body: { organizationId } })
    .catch((error: unknown) => {
      logger.warn("session.set_active_organization_failed", { userId: session.user.id, error });
    });
  return { ...base, tenantId: organizationId };
}

export async function requireAdminSession(headers: Headers): Promise<{ userId: string }> {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw new UnauthorizedError();
  }
  if (session.user.role !== "admin") {
    throw new ForbiddenError();
  }
  return { userId: session.user.id };
}
