import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth, isGoogleSignInEnabled } from "@/lib/server/auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AppSession {
  user: SessionUser;
  tenantId: string | null;
  /** Set while an admin is using the app as this user ("entrar como cliente"). */
  impersonatedBy: string | null;
}

export const getAppSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<AppSession | null> => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) {
      return null;
    }
    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role ?? "user",
      },
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
