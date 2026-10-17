import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeaders, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { hasAcceptedTerms } from "@sellbridge/database/repositories";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { isStaffRole } from "@sellbridge/shared/staff-access";
import { TERMS_VERSION } from "@sellbridge/shared/terms";
import { auth, isGoogleSignInEnabled } from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { findSessionProfileKind } from "@/lib/server/membership";
import { staffMiddleware } from "@/lib/server/middleware";

/**
 * Admin mode is a display preference: it shows the team tools (support inbox, customers) in the
 * interface to anyone on the SellBridge team. Permissions still come from the account role,
 * checked on every request.
 */
const ADMIN_MODE_COOKIE = "sellbridge-admin-mode";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Profile photo URL (uploaded or from Google); null shows the initials. */
  image: string | null;
  /** ISO date the account was created ("Membro desde" on the profile page). */
  createdAt: string;
}

export interface AppSession {
  user: SessionUser;
  tenantId: string | null;
  /** Seller or supplier: which screens and menu the app shows (`profileRedirectFor`). */
  profileKind: ProfileKind;
  /** Set while an admin is using the app as this user ("entrar como cliente"). */
  impersonatedBy: string | null;
  /** When an admin's visit ends on its own (ISO), or null outside one. */
  impersonationEndsAt: string | null;
  /** True only for team members (agent, supervisor, admin) who turned admin mode on. */
  adminMode: boolean;
  /** Whether this person accepted the terms in force (item 26.a): the app asks first. */
  termsAccepted: boolean;
}

export const getAppSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<AppSession | null> => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) {
      return null;
    }
    const role = session.user.role ?? "user";
    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role,
        image: session.user.image ?? null,
        createdAt: new Date(session.user.createdAt).toISOString(),
      },
      adminMode: isStaffRole(role) && getCookie(ADMIN_MODE_COOKIE) === "on",
      tenantId: session.session.activeOrganizationId ?? null,
      profileKind: await findSessionProfileKind(
        session.user.id,
        session.session.activeOrganizationId ?? null,
      ),
      impersonatedBy: session.session.impersonatedBy ?? null,
      impersonationEndsAt: session.session.impersonatedBy
        ? new Date(session.session.expiresAt).toISOString()
        : null,
      termsAccepted: await hasAcceptedTerms(database, session.user.id, TERMS_VERSION),
    };
  },
);

export interface SignInOptions {
  google: boolean;
}

/** Which sign-in methods are configured on the server (drives the login/sign-up buttons). */
export const getSignInOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<SignInOptions> => ({ google: isGoogleSignInEnabled }),
);

export const setAdminMode = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("support.answer")])
  .validator(z.object({ enabled: z.boolean() }))
  .handler(async ({ data }) => {
    setCookie(ADMIN_MODE_COOKIE, data.enabled ? "on" : "off", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: environment.NODE_ENV === "production",
      maxAge: ONE_YEAR_SECONDS,
    });
    return { adminMode: data.enabled };
  });
