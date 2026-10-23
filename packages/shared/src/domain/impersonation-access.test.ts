import { describe, expect, it } from "vitest";
import {
  IMPERSONATION_REFUSAL_MESSAGES,
  impersonationRefusal,
  type ImpersonationRequest,
} from "./impersonation-access.ts";

const CUSTOMER = { id: "customer-1", role: "user" };

function request(overrides: Partial<ImpersonationRequest> = {}): ImpersonationRequest {
  return {
    actor: { id: "staff-1", role: "agent" },
    target: CUSTOMER,
    targetHasOpenTicket: true,
    ...overrides,
  };
}

describe("impersonationRefusal: the rules table of MVP item 3", () => {
  it.each(["agent", "supervisor"])("lets a %s in when the customer has an open ticket", (role) => {
    expect(impersonationRefusal(request({ actor: { id: "staff-1", role } }))).toBeNull();
  });

  it.each(["agent", "supervisor"])("refuses a %s when the customer has no open ticket", (role) => {
    const refusal = impersonationRefusal(
      request({ actor: { id: "staff-1", role }, targetHasOpenTicket: false }),
    );
    expect(refusal).toBe("no_open_ticket");
  });

  it("lets an admin into any customer, with or without a ticket", () => {
    const admin = { id: "admin-1", role: "admin" };
    expect(impersonationRefusal(request({ actor: admin, targetHasOpenTicket: false }))).toBeNull();
  });

  it.each(["agent", "supervisor", "admin"])("refuses anyone entering a %s account", (role) => {
    const admin = { id: "admin-1", role: "admin" };
    const refusal = impersonationRefusal(
      request({ actor: admin, target: { id: "team-1", role }, targetHasOpenTicket: true }),
    );
    expect(refusal).toBe("team_account");
  });

  it.each(["user,agent", "admin,user", "owner", "Agent"])(
    "treats a target whose role is %s as part of the team",
    (role) => {
      const refusal = impersonationRefusal(request({ target: { id: "odd-1", role } }));
      expect(refusal).toBe("team_account");
    },
  );

  it("lets the team into a customer whose role was never set", () => {
    expect(impersonationRefusal(request({ target: { id: "new-1", role: null } }))).toBeNull();
  });

  it("refuses entering one's own account", () => {
    const admin = { id: "admin-1", role: "admin" };
    expect(
      impersonationRefusal(request({ actor: admin, target: { id: "admin-1", role: "user" } })),
    ).toBe("self");
  });

  it.each([null, "user", "owner"])("refuses a caller whose role is %s", (role) => {
    expect(impersonationRefusal(request({ actor: { id: "x", role } }))).toBe("not_staff");
  });

  it("explains every refusal in plain Portuguese", () => {
    for (const message of Object.values(IMPERSONATION_REFUSAL_MESSAGES)) {
      expect(message).toMatch(/^[A-ZÀ-Ú].+\.$/);
    }
  });
});
