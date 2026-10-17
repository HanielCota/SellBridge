import { forbiddenError, unauthorizedError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { AccountIdentity } from "@sellbridge/shared/platform-owner";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import {
  hasStaffPermission,
  staffRoleOf,
  type StaffPermission,
  type StaffRole,
} from "@sellbridge/shared/staff-access";
import { auth } from "./auth.ts";
import { assertVisitNotOver } from "./impersonation-window.ts";
import { findFirstOrganizationId, findMemberProfileKind } from "./membership.ts";
import { assertSellerProfile } from "./supplier-panel-access.ts";

export interface TenantSession {
  tenantId: string;
  userId: string;
  role: string;
  /** Seller or supplier: what the active profile is (`organization.kind`). */
  profileKind: ProfileKind;
  /** The admin inside the account through "Entrar como cliente", or null for the customer. */
  impersonatedBy: string | null;
}

/**
 * Resolves the authenticated user and tenant from request headers.
 * Sessions created during sign-up may exist before the organization does, so it
 * falls back to the user's first organization and stores it as the active one. The active
 * organization saved in the session is only trusted while the user is still its member:
 * someone removed from an organization keeps their session, not its data.
 */
export async function requireTenantSession(headers: Headers): Promise<TenantSession> {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw unauthorizedError();
  }
  assertVisitNotOver(session.session);
  const base = {
    userId: session.user.id,
    role: session.user.role ?? "user",
    impersonatedBy: session.session.impersonatedBy ?? null,
  };
  const activeId = session.session.activeOrganizationId;
  // The session only remembers the organization; membership is checked every time.
  const activeKind = activeId ? await findMemberProfileKind(session.user.id, activeId) : null;
  if (activeId && activeKind !== null) {
    return { ...base, tenantId: activeId, profileKind: activeKind };
  }
  const organizationId = await findFirstOrganizationId(session.user.id);
  if (!organizationId) {
    throw forbiddenError("Sua conta não possui uma organização ativa");
  }
  const profileKind = (await findMemberProfileKind(session.user.id, organizationId)) ?? "seller";
  await auth.api
    .setActiveOrganization({ headers, body: { organizationId } })
    .catch((error: unknown) => {
      logger.warn("session.set_active_organization_failed", { userId: session.user.id, error });
    });
  return { ...base, tenantId: organizationId, profileKind };
}

/** A seller profile's session: stores, listings, orders and reports refuse a supplier profile. */
export async function requireSellerSession(headers: Headers): Promise<TenantSession> {
  const session = await requireTenantSession(headers);
  assertSellerProfile(session.profileKind);
  return session;
}

export interface AdminSession {
  userId: string;
  /** Who is acting, as the owner rules read it (`canManageAccount`). */
  actor: AccountIdentity;
}

export async function requireAdminSession(headers: Headers): Promise<AdminSession> {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw unauthorizedError();
  }
  if (session.user.role !== "admin") {
    throw forbiddenError();
  }
  const { email, emailVerified, role } = session.user;
  return { userId: session.user.id, actor: { email, emailVerified, role } };
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
