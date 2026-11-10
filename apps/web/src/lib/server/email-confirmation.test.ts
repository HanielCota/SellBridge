import { describe, expect, it } from "vitest";
import { createSendCooldown, mustConfirmBeforeSession } from "./email-confirmation.ts";

describe("createSendCooldown", () => {
  it("sends one link per address per minute", () => {
    const cooldown = createSendCooldown();

    const first = cooldown.tryStart("Dono@Exemplo.com.br", 0);
    const repeated = cooldown.tryStart("dono@exemplo.com.br ", 59_999);

    expect([first, repeated]).toEqual([true, false]);
  });

  it("sends again once the minute has passed", () => {
    const cooldown = createSendCooldown();
    cooldown.tryStart("dono@exemplo.com.br", 0);

    const later = cooldown.tryStart("dono@exemplo.com.br", 60_000);

    expect(later).toBe(true);
  });

  it("keeps other addresses independent", () => {
    const cooldown = createSendCooldown();
    cooldown.tryStart("dono@exemplo.com.br", 0);

    const other = cooldown.tryStart("outra@exemplo.com.br", 1);

    expect(other).toBe(true);
  });

  it("forgets the oldest address when the cap is reached", () => {
    const cooldown = createSendCooldown();
    cooldown.tryStart("primeira@exemplo.com.br", 0);
    for (let index = 0; index < 1_000; index += 1) {
      cooldown.tryStart(`conta-${index}@exemplo.com.br`, 1);
    }

    const firstAgain = cooldown.tryStart("primeira@exemplo.com.br", 2);

    expect(firstAgain).toBe(true);
  });
});

describe("mustConfirmBeforeSession", () => {
  it("holds the session of a new sign-up whose e-mail is not confirmed", () => {
    const account = { emailVerified: false, emailConfirmationRequired: true };

    const mustConfirm = mustConfirmBeforeSession(account, false);

    expect(mustConfirm).toBe(true);
  });

  it("lets a new sign-up in once the e-mail is confirmed", () => {
    const account = { emailVerified: true, emailConfirmationRequired: true };

    const mustConfirm = mustConfirmBeforeSession(account, false);

    expect(mustConfirm).toBe(false);
  });

  it("keeps an account from before the rule signing in without confirming", () => {
    const account = { emailVerified: false, emailConfirmationRequired: false };

    const mustConfirm = mustConfirmBeforeSession(account, false);

    expect(mustConfirm).toBe(false);
  });

  it("lets an admin visit an account that has not confirmed yet", () => {
    const account = { emailVerified: false, emailConfirmationRequired: true };

    const mustConfirm = mustConfirmBeforeSession(account, true);

    expect(mustConfirm).toBe(false);
  });
});
