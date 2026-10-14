import { forbiddenError, unauthorizedError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  hasStaffPermission,
  staffRoleOf,
  type StaffPermission,
  type StaffRole,
} from "@sellbridge/shared/staff-access";
import { auth } from "./auth.ts";
import { findFirstOrganizationId, isMemberOf } from "./membership.ts";

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
    throw unauthorizedError();
  }
  const base = { userId: session.user.id, role: session.user.role ?? "user" };
  const activeId = session.session.activeOrganizationId;
  // The session only remembers the organization; membership is checked every time.
  if (activeId && (await isMemberOf(session.user.id, activeId))) {
    return { ...base, tenantId: activeId };
  }
  const organizationId = await findFirstOrganizationId(session.user.id);
  if (!organizationId) {
    throw forbiddenError("Sua conta não possui uma organização ativa");
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
    throw unauthorizedError();
  }
  if (session.user.role !== "admin") {
    throw forbiddenError();
  }
  return { userId: session.user.id };
}

export interface StaffSession {
  userId: string;
  role: StaffRole;
}

/** A member of the SellBridge team allowed to do `permission` (see staff-access.ts). */
export async function requireStaffSession(
  headers: Headers,
  permission: StaffPermission,
): Promise<StaffSession> {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw unauthorizedError();
  }
  const role = staffRoleOf(session.user.role);
  if (!role || !hasStaffPermission(role, permission)) {
    throw forbiddenError();
  }
  return { userId: session.user.id, role };
}
