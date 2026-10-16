/** What the policy reads from a Better Auth hook context. */
export interface AuthRouteCall {
  path: string;
  /** Set when the call came over HTTP; `auth.api.*` calls from the server have none. */
  request?: Request | undefined;
}

/**
 * The only admin plugin routes the browser calls: entering and leaving a customer's account from
 * the admin screens (the session hooks record both in the customer's timeline).
 */
const ADMIN_ROUTES_OPEN_TO_BROWSERS: ReadonlySet<string> = new Set([
  "/admin/impersonate-user",
  "/admin/stop-impersonating",
]);

function isAdminPluginRoute(path: string): boolean {
  return path.startsWith("/admin/");
}

/**
 * One organization per account, created by the server at sign-up: from the browser the plugin's
 * routes would create extra organizations (a fresh free plan each), delete one with all its
 * orders, or invite members.
 */
function isOrganizationPluginRoute(path: string): boolean {
  return path.startsWith("/organization/");
}

/**
 * The account's own security routes: password, sessions and linked sign-ins (Google). An admin
 * inside the customer's account must not reach them; the customer can, in their own session.
 */
export const ACCOUNT_SECURITY_PATHS: ReadonlySet<string> = new Set([
  "/change-password",
  "/set-password",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/unlink-account",
  "/link-social",
  "/get-access-token",
  "/refresh-token",
  "/account-info",
]);

/**
 * Plugin routes the browser never needs. The app's own server functions call them through
 * `auth.api` (with their checks and the audit trail); over HTTP they would skip both. Admin
 * routes are an allow-list, so a route a new plugin version adds starts closed.
 */
export function isClosedToBrowsers(call: AuthRouteCall): boolean {
  if (call.request === undefined) {
    return false;
  }
  if (isOrganizationPluginRoute(call.path)) {
    return true;
  }
  return isAdminPluginRoute(call.path) && !ADMIN_ROUTES_OPEN_TO_BROWSERS.has(call.path);
}
