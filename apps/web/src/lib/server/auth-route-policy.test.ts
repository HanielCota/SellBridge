import { describe, expect, it } from "vitest";
import { isClosedToBrowsers } from "./auth-route-policy";

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
