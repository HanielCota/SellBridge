import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

const statement = { ...defaultStatements } as const;

/**
 * Roles known to the Better Auth admin plugin. Only `admin` gets its powers (ban, impersonate,
 * set roles); the support roles get none here — what they may do in support lives in
 * `@sellbridge/shared/staff-access`. Shared by the server and the browser client.
 */
export const authAccessControl = createAccessControl(statement);

const noAdminPowers = { user: [], session: [] };

export const authRoles = {
  user: authAccessControl.newRole(noAdminPowers),
  agent: authAccessControl.newRole(noAdminPowers),
  supervisor: authAccessControl.newRole(noAdminPowers),
  admin: authAccessControl.newRole(adminAc.statements),
};
