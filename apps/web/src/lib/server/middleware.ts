import { logger } from "@sellbridge/shared/logger";
import type { StaffPermission } from "@sellbridge/shared/staff-access";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import {
  requireAdminSession,
  requireStaffSession,
  requireTenantSession,
} from "./tenant-session.ts";
import { toUserFacingError } from "./user-facing-error.ts";

/**
 * Wraps every server function behind the tenant and admin middlewares: an unexpected error is
 * logged with its stack here and reaches the browser only as a generic message.
 */
const userFacingErrors = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    const result = toUserFacingError(error);
    if (result.isUnexpected) {
      logger.error("server_fn.unexpected_error", { error });
    }
    throw result.error;
  }
});

/** Requires an authenticated user with an organization (tenant) and injects `tenantId`. */
export const tenantMiddleware = createMiddleware({ type: "function" })
  .middleware([userFacingErrors])
  .server(async ({ next }) => {
    const context = await requireTenantSession(getRequestHeaders());
    return next({ context });
  });

export const adminMiddleware = createMiddleware({ type: "function" })
  .middleware([userFacingErrors])
  .server(async ({ next }) => {
    const context = await requireAdminSession(getRequestHeaders());
    return next({ context });
  });

/** Requires a member of the support team with `permission`; injects `userId` and `role`. */
export function staffMiddleware(permission: StaffPermission) {
  return createMiddleware({ type: "function" })
    .middleware([userFacingErrors])
    .server(async ({ next }) => {
      const context = await requireStaffSession(getRequestHeaders(), permission);
      return next({ context });
    });
}
