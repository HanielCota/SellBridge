import { describe, expect, it } from "vitest";
import { isTeamModeOn, isTeamOnlyAccount, teamHomeFor } from "./team-mode";

/*
 * Regression: a new attendant started with the team mode off, landed on the reseller's
 * "Falta pouco para sua primeira venda" and was sent back there from the ticket queue.
 */
describe("team mode", () => {
  it("starts on for agents and supervisors, who only work on the team side", () => {
    expect(isTeamModeOn("agent", undefined)).toBe(true);
    expect(isTeamModeOn("supervisor", undefined)).toBe(true);
  });

  it("starts off for an admin, who also sells, and never turns on for a reseller", () => {
    expect(isTeamModeOn("admin", undefined)).toBe(false);
    expect(isTeamModeOn("user", "on")).toBe(false);
  });

  it("keeps the choice once someone made it", () => {
    expect(isTeamModeOn("agent", "off")).toBe(false);
    expect(isTeamModeOn("admin", "on")).toBe(true);
  });

  it("starts agents and supervisors on the ticket queue instead of the sales dashboard", () => {
    expect(teamHomeFor("agent", true)).toBe("/admin/chamados");
    expect(teamHomeFor("supervisor", true)).toBe("/admin/chamados");
    expect(teamHomeFor("agent", false)).toBeNull();
    expect(teamHomeFor("admin", true)).toBeNull();
    expect(teamHomeFor("user", false)).toBeNull();
  });
});

describe("isTeamOnlyAccount", () => {
  it("is a team member with no profile of their own, like an invited attendant", () => {
    expect(isTeamOnlyAccount("agent", 0)).toBe(true);
    expect(isTeamOnlyAccount("supervisor", 0)).toBe(true);
  });

  it("is not a team member with a store, nor a customer with no profile", () => {
    expect(isTeamOnlyAccount("agent", 1)).toBe(false);
    expect(isTeamOnlyAccount("admin", 2)).toBe(false);
    expect(isTeamOnlyAccount("user", 0)).toBe(false);
  });
});
