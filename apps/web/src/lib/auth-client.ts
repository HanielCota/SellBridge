import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { authAccessControl, authRoles } from "./auth-roles";

export const authClient = createAuthClient({
  plugins: [organizationClient(), adminClient({ ac: authAccessControl, roles: authRoles })],
});
