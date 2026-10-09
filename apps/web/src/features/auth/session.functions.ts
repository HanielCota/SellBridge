import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeaders, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { auth, isGoogleSignInEnabled } from "@/lib/server/auth";
import { adminMiddleware } from "@/lib/server/middleware";

/**
 * Admin mode is a display preference: it shows the admin tools in the interface.
 * Permissions still come from the account role, checked on every admin request.
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
}

export interface AppSession {
  user: SessionUser;
  tenantId: string | null;
  /** Set while an admin is using the app as this user ("entrar como cliente"). */
  impersonatedBy: string | null;
  /** True only for admins who turned admin mode on in the profile menu. */
  adminMode: boolean;
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
      },
      adminMode: role === "admin" && getCookie(ADMIN_MODE_COOKIE) === "on",
      tenantId: session.session.activeOrganizationId ?? null,
      impersonatedBy: session.session.impersonatedBy ?? null,
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
  .middleware([adminMiddleware])
  .validator(z.object({ enabled: z.boolean() }))
  .handler(async ({ data }) => {
    setCookie(ADMIN_MODE_COOKIE, data.enabled ? "on" : "off", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ONE_YEAR_SECONDS,
    });
    return { adminMode: data.enabled };
  });
