import { ForbiddenError, UnauthorizedError } from "@sellbridge/shared/errors";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "./auth.ts";

async function loadSession() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
}

/** Requires an authenticated user with an active organization (tenant). */
export const tenantMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await loadSession();
  const tenantId = session.session.activeOrganizationId;
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
