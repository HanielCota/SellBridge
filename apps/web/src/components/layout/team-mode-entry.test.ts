import { describe, expect, it } from "vitest";
import { teamEntryPage } from "./team-mode-entry";

// Regression: the header button sent a supervisor to review moderation, while signing in sends
// supervisors to the ticket queue; the team's way in now lands where their day starts.
describe("teamEntryPage", () => {
  it("opens the ticket queue for agents and supervisors", () => {
    expect(teamEntryPage("agent")).toBe("/admin/chamados");
    expect(teamEntryPage("supervisor")).toBe("/admin/chamados");
  });

  it("opens the first admin page for an admin", () => {
    expect(teamEntryPage("admin")).toBe("/admin/products");
  });
});
