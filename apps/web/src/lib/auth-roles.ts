import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

const statement = { ...defaultStatements } as const;

/**
 * Roles known to the Better Auth admin plugin. `admin` gets its powers (ban, impersonate, set
 * roles); agents and supervisors only impersonate, and the server lets them in only for a
 * customer with an open ticket (`@sellbridge/shared/impersonation-access`). No role may enter a
 * team account: none has `impersonate-admins`. Shared by the server and the browser client.
 */
export const authAccessControl = createAccessControl(statement);

const noAdminPowers = { user: [], session: [] };
const impersonationOnly = { user: ["impersonate"] as const, session: [] };

export const authRoles = {
  user: authAccessControl.newRole(noAdminPowers),
  agent: authAccessControl.newRole(impersonationOnly),
  supervisor: authAccessControl.newRole(impersonationOnly),
  admin: authAccessControl.newRole(adminAc.statements),
};
