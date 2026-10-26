import { describe, expect, it } from "vitest";
import { ACCOUNT_SECURITY_PATHS, isClosedToBrowsers } from "./auth-route-policy";

const overHttp = (path: string) => ({
  path,
  request: new Request(`https://sellbridge.test/api/auth${path}`, { method: "POST" }),
});
const fromServer = (path: string) => ({ path });

/** Every admin plugin route of Better Auth 1.7, but the two the browser uses. */
const ADMIN_ROUTES_THE_BROWSER_NEVER_USES = [
  "/admin/create-user",
  "/admin/list-users",
  "/admin/get-user",
  "/admin/update-user",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/remove-user",
  "/admin/list-user-sessions",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/has-permission",
];

describe("ACCOUNT_SECURITY_PATHS", () => {
  it.each([
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
  ])("closes %s during a visit as the customer", (path) => {
    expect(ACCOUNT_SECURITY_PATHS.has(path)).toBe(true);
  });
});

describe("isClosedToBrowsers", () => {
  it.each(ADMIN_ROUTES_THE_BROWSER_NEVER_USES)("closes %s over HTTP", (path) => {
    expect(isClosedToBrowsers(overHttp(path))).toBe(true);
  });

  it.each(["/organization/create", "/organization/delete", "/organization/invite-member"])(
    "closes %s over HTTP",
    (path) => {
      expect(isClosedToBrowsers(overHttp(path))).toBe(true);
    },
  );

  // Regression (security audit, 26/10/2026): /verify-password answered right or wrong to any
  // session at 100 tries per 10 s, also during a team visit, while /delete-user allows 5 a minute.
  it("closes the password check over HTTP and keeps it for server calls", () => {
    expect(isClosedToBrowsers(overHttp("/verify-password"))).toBe(true);
    expect(isClosedToBrowsers(fromServer("/verify-password"))).toBe(false);
  });

  it("closes an admin route the plugin may add in a later version", () => {
    expect(isClosedToBrowsers(overHttp("/admin/some-new-route"))).toBe(true);
  });

  it("keeps entering and leaving a customer's account open to the admin screens", () => {
    expect(isClosedToBrowsers(overHttp("/admin/impersonate-user"))).toBe(false);
    expect(isClosedToBrowsers(overHttp("/admin/stop-impersonating"))).toBe(false);
  });

  it("leaves the app's own server calls and the account routes alone", () => {
    expect(isClosedToBrowsers(fromServer("/admin/set-role"))).toBe(false);
    expect(isClosedToBrowsers(fromServer("/organization/create"))).toBe(false);
    expect(isClosedToBrowsers(overHttp("/sign-in/email"))).toBe(false);
    expect(isClosedToBrowsers(overHttp("/get-session"))).toBe(false);
    expect(isClosedToBrowsers(overHttp("/administrator"))).toBe(false);
  });
});
