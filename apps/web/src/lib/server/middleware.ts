import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { StaffPermission } from "@sellbridge/shared/staff-access";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders, setResponseStatus } from "@tanstack/react-start/server";
import {
  requireAdminSession,
  requireStaffSession,
  requireTenantSession,
} from "./tenant-session.ts";
import { toUserFacingError } from "./user-facing-error.ts";
import { assertAllowedWhileImpersonating, recordImpersonatedCall } from "./impersonation.ts";

/** A refused request answers 401 or 403 instead of 500, so clients and monitors see why. */
function setRefusalStatus(error: unknown): void {
  if (isAppError(error) && error.code === "FORBIDDEN") {
    setResponseStatus(403);
  }
  if (isAppError(error) && error.code === "UNAUTHORIZED") {
    setResponseStatus(401);
  }
}

/**
 * Wraps every server function behind the tenant, admin and staff middlewares: an unexpected
 * error is logged with its stack here and reaches the browser only as a generic message.
 */
const userFacingErrors = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    setRefusalStatus(error);
    const result = toUserFacingError(error);
    if (result.isUnexpected) {
      logger.error("server_fn.unexpected_error", { error });
    }
    throw result.error;
  }
});

/**
 * For server functions open without a session (the supplier link): no access check of its own,
 * but the same error shield, so a database or validation error never reaches an anonymous caller
 * with its query, schema or parameters.
 */
export const publicMiddleware = createMiddleware({ type: "function" }).middleware([
  userFacingErrors,
]);

/** Requires an authenticated user with an organization (tenant) and injects `tenantId`. */
export const tenantMiddleware = createMiddleware({ type: "function" })
  .middleware([userFacingErrors])
  .server(async ({ next, method, serverFnMeta }) => {
    const context = await requireTenantSession(getRequestHeaders());
    // Inside a customer's account through "Entrar como cliente": some actions are refused, the
    // rest is recorded under the admin's name once it went through.
    const call = {
      impersonatedBy: context.impersonatedBy,
      customerId: context.userId,
      functionName: serverFnMeta.name,
      method,
    };
    assertAllowedWhileImpersonating(call);
    const result = await next({ context });
    await recordImpersonatedCall(call);
    return result;
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
