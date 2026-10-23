import { describe, expect, it } from "vitest";
import { authRoles } from "./auth-roles";

const ADMIN_ONLY_POWERS = [
  "list",
  "ban",
  "set-role",
  "create",
  "delete",
  "set-password",
  "update",
] as const;

describe("admin plugin powers of each role", () => {
  it.each(["agent", "supervisor", "admin"] as const)("lets a %s impersonate", (role) => {
    expect(authRoles[role].authorize({ user: ["impersonate"] }).success).toBe(true);
  });

  it.each(["agent", "supervisor"] as const)("gives a %s nothing else", (role) => {
    for (const power of ADMIN_ONLY_POWERS) {
      expect(authRoles[role].authorize({ user: [power] }).success).toBe(false);
    }
    expect(authRoles[role].authorize({ session: ["revoke"] }).success).toBe(false);
  });

  it.each(["user", "agent", "supervisor", "admin"] as const)(
    "never lets a %s enter a team account",
    (role) => {
      expect(authRoles[role].authorize({ user: ["impersonate-admins"] }).success).toBe(false);
    },
  );

  it("keeps customers without any admin power", () => {
    expect(authRoles.user.authorize({ user: ["impersonate"] }).success).toBe(false);
  });
});
