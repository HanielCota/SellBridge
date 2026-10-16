import { describe, expect, it } from "vitest";
import { planTeamInvite } from "./team-invite.ts";

const OWNERS = ["dono@sellbridge.com"];

function account(role: string, emailVerified = true) {
  return { id: "u1", email: "ana@loja.com", role, emailVerified };
}

describe("planTeamInvite", () => {
  it("creates an account for an address nobody uses yet", () => {
    expect(planTeamInvite("nova@loja.com", null, "agent", OWNERS)).toEqual({ kind: "create" });
  });

  it("changes the role of someone already on the team", () => {
    expect(planTeamInvite("ana@loja.com", account("agent"), "supervisor", OWNERS)).toEqual({
      kind: "promote",
      userId: "u1",
      previousRole: "agent",
    });
  });

  it("refuses inviting someone into the role they already have", () => {
    expect(planTeamInvite("ana@loja.com", account("agent"), "agent", OWNERS)).toEqual({
      kind: "refuse",
      reason: "Esta pessoa já faz parte da equipe como Atendente",
    });
  });

  // Regression (review of ca7ddbb): whoever registered the address first, without proving the
  // mailbox, would get the team role and keep their own password.
  it("refuses an account whose e-mail was never confirmed", () => {
    expect(planTeamInvite("ana@loja.com", account("user", false), "admin", OWNERS)).toMatchObject({
      kind: "refuse",
      reason: expect.stringContaining("não confirmou o e-mail"),
    });
  });

  it("refuses turning a customer's account into a team account", () => {
    expect(planTeamInvite("ana@loja.com", account("user"), "agent", OWNERS)).toMatchObject({
      kind: "refuse",
      reason: expect.stringContaining("conta de cliente"),
    });
  });

  it("leaves owner addresses to ADMIN_EMAILS, with or without an account", () => {
    const refusal = {
      kind: "refuse",
      reason:
        "Este e-mail é de um dono da plataforma: ele entra pela configuração, não por convite",
    };
    expect(planTeamInvite("Dono@SellBridge.com", null, "admin", OWNERS)).toEqual(refusal);
    expect(
      planTeamInvite(
        "dono@sellbridge.com",
        { ...account("admin"), email: "dono@sellbridge.com" },
        "agent",
        OWNERS,
      ),
    ).toEqual(refusal);
  });
});
