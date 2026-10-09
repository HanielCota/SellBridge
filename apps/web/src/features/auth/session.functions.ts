import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/server/auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AppSession {
  user: SessionUser;
  tenantId: string | null;
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
    };
  },
);
