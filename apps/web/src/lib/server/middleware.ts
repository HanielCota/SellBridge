import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders, setResponseStatus } from "@tanstack/react-start/server";
import { isAppError } from "@sellbridge/shared/errors";
import { requireAdminSession, requireTenantSession } from "./tenant-session.ts";

/** Requires an authenticated user with an organization (tenant) and injects `tenantId`. */
export const tenantMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const context = await requireTenantSession(getRequestHeaders());
  return next({ context });
});

export const adminMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    const context = await requireAdminSession(getRequestHeaders());
    return await next({ context });
  } catch (error) {
    if (isAppError(error) && error.code === "FORBIDDEN") {
      setResponseStatus(403);
    }
    if (isAppError(error) && error.code === "UNAUTHORIZED") {
      setResponseStatus(401);
    }
    throw error;
  }
});
