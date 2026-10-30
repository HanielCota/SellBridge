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
import { assertVisitNotOver, mayKeepVisiting, VISIT_OVER_MESSAGE } from "./impersonation-window.ts";
import { listMemberships, type Membership } from "./membership.ts";
import { findVisitingStaff } from "./visiting-staff.ts";
import { assertSellerProfile } from "./supplier-panel-access.ts";
import { profileHeaderOf, requestedProfileOf } from "../profile-param.ts";

export interface TenantSession {
  tenantId: string;
  userId: string;
  role: string;
  /** Seller or supplier: what the active profile is (`organization.kind`). */
  profileKind: ProfileKind;
  /** The admin inside the account through "Entrar como cliente", or null for the customer. */
  impersonatedBy: string | null;
}

export type ProfileSource = "requested" | "session" | "first";

export interface ResolvedProfile {
  organizationId: string;
  /** Seller or supplier: what the resolved profile is (`organization.kind`). */
  kind: ProfileKind;
  /** Where the profile came from: only "first" is saved back as the session's active one. */
  source: ProfileSource;
}

export interface ProfileResolutionInput {
  /** The slug the tab asked for (header or `?perfil=`), or null. */
  requested: string | null;
  /** The organization saved in the session: the default for a tab that asks for none. */
  sessionActive: string | null | undefined;
  memberships: readonly Membership[];
}

/**
 * Which organization a request works on. A tab that names its profile gets exactly that one, or
 * a refusal: never another profile in its place. A tab that names none gets the session's
 * active organization while the user is still its member, else the oldest one.
 */
export function resolveProfileId(input: ProfileResolutionInput): ResolvedProfile {
  const { requested, sessionActive, memberships } = input;
  if (requested !== null) {
    const match = memberships.find((membership) => membership.slug === requested);
    if (match === undefined) {
      throw forbiddenError(`O perfil "${requested}" não está na sua conta.`);
    }
    return { organizationId: match.organizationId, kind: match.kind, source: "requested" };
  }
  const active = memberships.find((membership) => membership.organizationId === sessionActive);
  if (active !== undefined) {
    return { organizationId: active.organizationId, kind: active.kind, source: "session" };
  }
  const first = memberships.at(0);
  if (first === undefined) {
    throw forbiddenError("Sua conta não possui uma organização ativa");
  }
  return { organizationId: first.organizationId, kind: first.kind, source: "first" };
}

/**
 * Resolves the authenticated user and tenant from request headers and the profile the tab asked
 * for (the `x-sellbridge-profile` header unless the caller read it elsewhere, e.g. the URL).
 * Sessions created during sign-up may exist before the organization does, so a tab asking for
 * nothing falls back to the user's first organization and stores it as the active one.
 * Membership is checked every time: someone removed from an organization keeps their session,
 * not its data.
 */
export async function requireTenantSession(
  headers: Headers,
  requestedProfile: string | null = profileHeaderOf(headers),
): Promise<TenantSession> {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw unauthorizedError();
  }
  assertVisitNotOver(session.session);
  await assertVisitorStillAllowed(session.session.impersonatedBy);
  const profile = resolveProfileId({
    requested: requestedProfile,
    sessionActive: session.session.activeOrganizationId,
    memberships: await listMemberships(session.user.id),
  });
  if (profile.source === "first") {
    await saveActiveOrganization(headers, profile.organizationId, session.user.id);
  }
  return {
    tenantId: profile.organizationId,
    userId: session.user.id,
    role: session.user.role ?? "user",
    profileKind: profile.kind,
    impersonatedBy: session.session.impersonatedBy ?? null,
  };
}

/**
 * Ends a visit whose team member was banned, demoted or removed since it started. Every route
 * that reads the session on its own calls this next to `assertVisitNotOver`.
 *
 * @param impersonatedBy - The session's `impersonatedBy`: the team member behind a visit, if any.
 * @throws {AppError} With code `UNAUTHORIZED` when that team member may no longer visit.
 */
export async function assertVisitorStillAllowed(
  impersonatedBy: string | null | undefined,
): Promise<void> {
  if (impersonatedBy == null) {
    return;
  }

  if (mayKeepVisiting(await findVisitingStaff(impersonatedBy))) {
    return;
  }

  throw unauthorizedError(VISIT_OVER_MESSAGE);
}

/** For HTTP routes (downloads, uploads, OAuth): the profile comes from the header or the URL. */
export async function requireTenantRequest(request: Request): Promise<TenantSession> {
  return requireTenantSession(request.headers, requestedProfileOf(request));
}

/**
 * A seller profile's session: stores, listings, orders and reports refuse a supplier profile.
 * The kind checked is the tab's profile, resolved as in `requireTenantSession`.
 */
export async function requireSellerSession(
  headers: Headers,
  requestedProfile: string | null = profileHeaderOf(headers),
): Promise<TenantSession> {
  const session = await requireTenantSession(headers, requestedProfile);
  assertSellerProfile(session.profileKind);
  return session;
}

/** `requireSellerSession` for HTTP routes: the profile comes from the header or the URL. */
export async function requireSellerRequest(request: Request): Promise<TenantSession> {
  return requireSellerSession(request.headers, requestedProfileOf(request));
}

async function saveActiveOrganization(headers: Headers, organizationId: string, userId: string) {
  try {
    await auth.api.setActiveOrganization({ headers, body: { organizationId } });
  } catch (error: unknown) {
    logger.warn("session.set_active_organization_failed", { userId, error });
  }
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
