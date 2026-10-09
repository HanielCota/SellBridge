import { ForbiddenError, UnauthorizedError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "./auth.ts";
import { findFirstOrganizationId } from "./membership.ts";

async function loadSession() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
}

/**
 * Sessions created during sign-up may exist before the user's organization does.
 * Falls back to the user's first organization and stores it as the active one.
 */
async function resolveTenantId(session: Awaited<ReturnType<typeof loadSession>>) {
  const activeId = session.session.activeOrganizationId;
  if (activeId) {
    return activeId;
  }
  const organizationId = await findFirstOrganizationId(session.user.id);
  if (!organizationId) {
    return null;
  }
  await auth.api
    .setActiveOrganization({ headers: getRequestHeaders(), body: { organizationId } })
    .catch((error: unknown) => {
      logger.warn("session.set_active_organization_failed", { userId: session.user.id, error });
    });
  return organizationId;
}

/** Requires an authenticated user with an organization (tenant). */
export const tenantMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await loadSession();
  const tenantId = await resolveTenantId(session);
  if (!tenantId) {
    throw new ForbiddenError("Sua conta não possui uma organização ativa");
  }
  return next({
    context: {
      tenantId,
      userId: session.user.id,
      role: session.user.role ?? "user",
    },
  });
});

/** Requires an authenticated user with the admin role. */
export const adminMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await loadSession();
  if (session.user.role !== "admin") {
    throw new ForbiddenError();
  }
  return next({ context: { userId: session.user.id } });
});
