import { describe, expect, test } from "vitest";
import { staffMenuSections } from "./staff-menu";

describe("staffMenuSections", () => {
  // Regression: a team-only member with admin mode off had an empty sidebar.
  test("shows the team pages to a team-only member even with admin mode off", () => {
    expect(staffMenuSections({ teamOnly: true, adminMode: false, teamItemCount: 3 })).toEqual({
      business: false,
      team: true,
      empty: false,
    });
  });

  test("keeps the team pages out of a member's business view while admin mode is off", () => {
    expect(staffMenuSections({ teamOnly: false, adminMode: false, teamItemCount: 3 })).toEqual({
      business: true,
      team: false,
      empty: false,
    });
  });

  test("shows both parts in admin mode", () => {
    expect(staffMenuSections({ teamOnly: false, adminMode: true, teamItemCount: 3 })).toEqual({
      business: true,
      team: true,
      empty: false,
    });
  });

  test("flags the menu as empty when a team-only member has no page allowed", () => {
    expect(staffMenuSections({ teamOnly: true, adminMode: true, teamItemCount: 0 })).toEqual({
      business: false,
      team: false,
      empty: true,
    });
  });
});
