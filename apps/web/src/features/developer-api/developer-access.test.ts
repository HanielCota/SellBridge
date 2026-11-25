import { describe, expect, it } from "vitest";
import { isDeveloperSession } from "./developer-access";

const DEVELOPERS = ["dev@sellbridge.test"];
const developer = { email: "dev@sellbridge.test", emailVerified: true, banned: false };

describe("isDeveloperSession", () => {
  it("lets a listed account with a confirmed e-mail in", () => {
    const allowed = isDeveloperSession({ account: developer, impersonatedBy: null }, DEVELOPERS);

    expect(allowed).toBe(true);
  });

  it("matches the listed e-mail regardless of letter case", () => {
    const account = { ...developer, email: "Dev@SellBridge.test" };

    const allowed = isDeveloperSession({ account, impersonatedBy: null }, DEVELOPERS);

    expect(allowed).toBe(true);
  });

  it("refuses an account whose e-mail is not in the list", () => {
    const account = { ...developer, email: "other@sellbridge.test" };

    const allowed = isDeveloperSession({ account, impersonatedBy: null }, DEVELOPERS);

    expect(allowed).toBe(false);
  });

  it("refuses an admin whose e-mail is not in the list", () => {
    const admin = { ...developer, email: "admin@sellbridge.test" };

    const allowed = isDeveloperSession({ account: admin, impersonatedBy: null }, DEVELOPERS);

    expect(allowed).toBe(false);
  });

  it("refuses a listed account whose e-mail is not confirmed", () => {
    const account = { ...developer, emailVerified: false };

    const allowed = isDeveloperSession({ account, impersonatedBy: null }, DEVELOPERS);

    expect(allowed).toBe(false);
  });

  it("refuses a blocked listed account", () => {
    const account = { ...developer, banned: true };

    const allowed = isDeveloperSession({ account, impersonatedBy: null }, DEVELOPERS);

    expect(allowed).toBe(false);
  });

  it("refuses staff using the developer's account through impersonation", () => {
    const allowed = isDeveloperSession(
      { account: developer, impersonatedBy: "admin-user" },
      DEVELOPERS,
    );

    expect(allowed).toBe(false);
  });

  it("refuses everyone when the list is empty", () => {
    const allowed = isDeveloperSession({ account: developer, impersonatedBy: null }, []);

    expect(allowed).toBe(false);
  });
});
