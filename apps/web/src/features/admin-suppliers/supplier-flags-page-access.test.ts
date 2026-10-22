import { describe, expect, it } from "vitest";
import { flagsPageRedirect } from "./supplier-flags-page-access";

const team = (role: string) => ({ adminMode: true, user: { role } });

describe("flagsPageRedirect", () => {
  it("opens the flags page to every team member in team mode", () => {
    expect(flagsPageRedirect(team("agent"))).toBeNull();
    expect(flagsPageRedirect(team("supervisor"))).toBeNull();
    expect(flagsPageRedirect(team("admin"))).toBeNull();
  });

  it("sends an anonymous visitor to the login", () => {
    expect(flagsPageRedirect(null)).toBe("/login");
  });

  it("keeps sellers and suppliers out", () => {
    expect(flagsPageRedirect({ adminMode: false, user: { role: "user" } })).toBe("/dashboard");
    expect(flagsPageRedirect({ adminMode: true, user: { role: "user" } })).toBe("/admin/chamados");
    expect(flagsPageRedirect({ adminMode: true, user: { role: null } })).toBe("/admin/chamados");
  });

  it("keeps a team member outside team mode on their own screens", () => {
    expect(flagsPageRedirect({ adminMode: false, user: { role: "agent" } })).toBe("/dashboard");
  });
});
