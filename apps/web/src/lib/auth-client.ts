import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { authAccessControl, authRoles } from "./auth-roles";

/**
 * The plugin clients type the session (active organization, role, impersonation). Over HTTP the
 * server only answers the admin routes for entering and leaving a customer's account; every
 * other `/admin/*` and all `/organization/*` routes return 404 (see `auth-route-policy.ts`).
 */
export const authClient = createAuthClient({
  plugins: [organizationClient(), adminClient({ ac: authAccessControl, roles: authRoles })],
});
