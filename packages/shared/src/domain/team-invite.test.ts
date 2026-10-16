import { describe, expect, it } from "vitest";
import { planTeamInvite } from "./team-invite.ts";

const OWNERS = ["dono@sellbridge.com"];

describe("planTeamInvite", () => {
  it("creates an account for an address nobody uses yet", () => {
    expect(planTeamInvite(null, "agent", OWNERS)).toEqual({ kind: "create" });
  });

  it("gives the role to an existing account outside the team", () => {
    expect(
      planTeamInvite({ id: "u1", email: "ana@loja.com", role: "user" }, "agent", OWNERS),
    ).toEqual({ kind: "promote", userId: "u1" });
  });

  it("changes the role of someone already on the team", () => {
    expect(
      planTeamInvite({ id: "u1", email: "ana@loja.com", role: "agent" }, "supervisor", OWNERS),
    ).toEqual({ kind: "promote", userId: "u1" });
  });

  it("refuses inviting someone into the role they already have", () => {
    expect(
      planTeamInvite({ id: "u1", email: "ana@loja.com", role: "agent" }, "agent", OWNERS),
    ).toEqual({ kind: "refuse", reason: "Esta pessoa já faz parte da equipe como Atendente" });
  });

  it("keeps a platform owner's address as admin", () => {
    expect(
      planTeamInvite({ id: "u2", email: "Dono@SellBridge.com", role: "admin" }, "agent", OWNERS),
    ).toEqual({
      kind: "refuse",
      reason: "Este e-mail é de um dono da plataforma e é sempre administrador",
    });
  });
});
