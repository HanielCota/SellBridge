import { describe, expect, it } from "vitest";
import { mustConfirmBeforeSession } from "./email-confirmation.ts";

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
