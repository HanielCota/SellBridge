import { describe, expect, it } from "vitest";
import { isTeamInviteLink, TEAM_INVITE_CALLBACK, teamInviteEmail } from "./team-invite-email";

const base = "https://app.sellbridge.test/api/auth/reset-password/tok123";

describe("isTeamInviteLink", () => {
  it("knows the set-password link sent with an invite", () => {
    const url = `${base}?callbackURL=${encodeURIComponent(TEAM_INVITE_CALLBACK)}`;
    expect(isTeamInviteLink(url)).toBe(true);
  });

  it("leaves an ordinary password reset alone", () => {
    expect(isTeamInviteLink(`${base}?callbackURL=%2Fredefinir-senha`)).toBe(false);
    expect(isTeamInviteLink("não é url")).toBe(false);
  });
});

describe("teamInviteEmail", () => {
  it("welcomes the person to the team and links to set the password", () => {
    const content = teamInviteEmail(base);
    expect(content.subject).toBe("Você foi convidado para a equipe do SellBridge");
    expect(content.actionLabel).toBe("Criar minha senha");
    expect(content.actionUrl).toBe(base);
  });
});
