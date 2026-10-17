import { isAppError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { StaffPermission } from "@sellbridge/shared/staff-access";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  requireAdminSession,
  requireSellerSession,
  requireStaffSession,
  requireTenantSession,
  type TenantSession,
} from "./tenant-session.ts";
import { assertSupplierPanelAccess } from "./supplier-panel-access.ts";
import { resolveSupplierPanelViewer } from "./supplier-panel-viewer.ts";
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

/**
 * Inside a customer's account through "Entrar como cliente": some actions are refused, the rest
 * is recorded under the admin's name once it went through.
 */
async function runAsCustomer<Result>(
  session: TenantSession,
  call: { functionName: string; method: string },
  run: () => Promise<Result>,
): Promise<Result> {
  const visit = { impersonatedBy: session.impersonatedBy, customerId: session.userId, ...call };
  assertAllowedWhileImpersonating(visit);
  const result = await run();
  await recordImpersonatedCall(visit);
  return result;
}

/** Requires an authenticated user with a profile and injects `tenantId` and `profileKind`. */
function profileMiddleware(requireSession: (headers: Headers) => Promise<TenantSession>) {
  return createMiddleware({ type: "function" })
    .middleware([userFacingErrors])
    .server(async ({ next, method, serverFnMeta }) => {
      const context = await requireSession(getRequestHeaders());
      return runAsCustomer(context, { functionName: serverFnMeta.name, method }, async () =>
        next({ context }),
      );
    });
}

/** Any profile of the account, seller or supplier: terms, support and notifications. */
export const accountMiddleware = profileMiddleware(requireTenantSession);

/** A seller profile (stores, listings, orders, reports); a supplier profile gets 403. */
export const tenantMiddleware = profileMiddleware(requireSellerSession);

const panelSupplierSchema = z.object({ supplierId: z.uuid("Fornecedor inválido") });

/**
 * Supplier panel functions take `supplierId` in their input: a supplier profile may only pass its
 * own, and the team (a platform admin) may act for any supplier. Reads the raw input, so each
 * function keeps its own validator.
 */
export const supplierPanelMiddleware = createMiddleware({ type: "function" })
  .middleware([userFacingErrors])
  .server(async ({ next, data, method, serverFnMeta }) => {
    const requested = panelSupplierSchema.safeParse(data);
    if (!requested.success) {
      throw validationError("Fornecedor inválido: envie o id do fornecedor (uuid).");
    }
    const session = await requireTenantSession(getRequestHeaders());
    const viewer = await resolveSupplierPanelViewer(session);
    assertSupplierPanelAccess(viewer, requested.data.supplierId);
    return runAsCustomer(session, { functionName: serverFnMeta.name, method }, async () =>
      next({ context: { ...session, viewer } }),
    );
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
