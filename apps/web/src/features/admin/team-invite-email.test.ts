import { describe, expect, it } from "vitest";
import { teamInviteEmail } from "./team-invite-email";

const url =
  "https://app.sellbridge.test/api/auth/reset-password/tok123?callbackURL=%2Fredefinir-senha";

describe("teamInviteEmail", () => {
  it("welcomes the person to the team and links to set the password", () => {
    const content = teamInviteEmail(url);
    expect(content.subject).toBe("Você foi convidado para a equipe do SellBridge");
    expect(content.actionLabel).toBe("Criar minha senha");
    expect(content.actionUrl).toBe(url);
  });
});
