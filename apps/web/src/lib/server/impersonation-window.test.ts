import { describe, expect, it } from "vitest";
import { assertVisitNotOver, isImpersonationOver, mayKeepVisiting } from "./impersonation-window";

const NOW = new Date("2026-10-15T12:00:00Z");
const minutesBefore = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe("isImpersonationOver", () => {
  it("keeps a visit for one hour from its start", () => {
    expect(isImpersonationOver(minutesBefore(59), NOW)).toBe(false);
    expect(isImpersonationOver(minutesBefore(61), NOW)).toBe(true);
  });

  it("ends a visit whose start cannot be read", () => {
    expect(isImpersonationOver(new Date("não é data"), NOW)).toBe(true);
  });
});

describe("assertVisitNotOver", () => {
  it("lets the customer's own session through, however old", () => {
    expect(() =>
      assertVisitNotOver({ impersonatedBy: null, createdAt: minutesBefore(600) }),
    ).not.toThrow();
  });

  it("refuses an admin's visit past the hour", () => {
    expect(() =>
      assertVisitNotOver({ impersonatedBy: "admin-1", createdAt: "2020-01-01T00:00:00Z" }),
    ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
  });
});

describe("mayKeepVisiting", () => {
  it.each(["agent", "admin"])(
    "keeps a visit while the team member (%s) may still enter accounts",
    (role) => {
      const visitor = { role, banned: false };

      const allowed = mayKeepVisiting(visitor);

      expect(allowed).toBe(true);
    },
  );

  it.each([
    { scenario: "banned", visitor: { role: "admin", banned: true } },
    { scenario: "demoted to a customer", visitor: { role: "user", banned: false } },
    { scenario: "left without a role", visitor: { role: null, banned: false } },
    { scenario: "gone", visitor: null },
  ])("ends a visit once the team member is $scenario", ({ visitor }) => {
    const allowed = mayKeepVisiting(visitor);

    expect(allowed).toBe(false);
  });
});
