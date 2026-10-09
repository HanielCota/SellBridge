import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { requireAdminSession, requireTenantSession } from "./tenant-session.ts";

/** Requires an authenticated user with an organization (tenant) and injects `tenantId`. */
export const tenantMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const context = await requireTenantSession(getRequestHeaders());
  return next({ context });
});

/** Requires an authenticated user with the admin role. */
export const adminMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const context = await requireAdminSession(getRequestHeaders());
  return next({ context });
});
