import { SIGN_UP_PROFILE_COOKIE } from "@sellbridge/shared/sign-up-profile";
import { describe, expect, it } from "vitest";
import {
  type AccountCreationCall,
  createProfileForNewUser,
  isSelfSignUpPath,
} from "./sign-up-profile.ts";

const NEW_USER = { id: "user-1", name: "Ateliê Barro" };

function fakeSteps(options: { markSucceeds?: boolean } = {}) {
  const calls = { created: [] as string[], marked: [] as string[] };
  return {
    calls,
    steps: {
      createOrganization: async (input: { userId: string; name: string }) => {
        calls.created.push(input.userId);
        return { id: "org-1" };
      },
      setOrganizationKind: async (organizationId: string, kind: string) => {
        calls.marked.push(`${organizationId}:${kind}`);
        return options.markSucceeds ?? true;
      },
    },
  };
}

function callWith(
  cookie?: string,
  path = "/sign-up/email",
  body: unknown = {},
): AccountCreationCall {
  return {
    path,
    body,
    getCookie: (name) => (name === SIGN_UP_PROFILE_COOKIE ? cookie : undefined),
  };
}

describe("createProfileForNewUser", () => {
  it("creates a seller profile without marking it when no kind is chosen", async () => {
    const { calls, steps } = fakeSteps();

    await createProfileForNewUser(NEW_USER, callWith(), steps);

    expect(calls.created).toEqual(["user-1"]);
    expect(calls.marked).toEqual([]);
  });

  it("marks the new profile as a supplier when the sign-up page chose it", async () => {
    const { calls, steps } = fakeSteps();

    await createProfileForNewUser(NEW_USER, callWith("supplier"), steps);

    expect(calls.marked).toEqual(["org-1:supplier"]);
  });

  it("creates a seller profile when the account comes from a server call", async () => {
    const { calls, steps } = fakeSteps();

    await createProfileForNewUser(NEW_USER, null, steps);

    expect(calls.created).toEqual(["user-1"]);
    expect(calls.marked).toEqual([]);
  });

  // Regression: an invited attendant got a reseller organization and its onboarding.
  it.each(["agent", "supervisor"])("creates no profile for an invited %s", async (role) => {
    const { calls, steps } = fakeSteps();
    const invite = callWith("supplier", "/admin/create-user", { role });

    await createProfileForNewUser(NEW_USER, invite, steps);

    expect(calls.created).toEqual([]);
    expect(calls.marked).toEqual([]);
  });

  it("keeps a seller profile for an invited admin, who also runs a store", async () => {
    const { calls, steps } = fakeSteps();
    const invite = callWith("supplier", "/admin/create-user", { role: "admin" });

    await createProfileForNewUser(NEW_USER, invite, steps);

    expect(calls.created).toEqual(["user-1"]);
    expect(calls.marked).toEqual([]);
  });

  it("ignores a profile choice left in the cookie outside the sign-up", async () => {
    const { calls, steps } = fakeSteps();

    await createProfileForNewUser(NEW_USER, callWith("supplier", "/admin/update-user"), steps);

    expect(calls.created).toEqual(["user-1"]);
    expect(calls.marked).toEqual([]);
  });

  it("fails loudly when the supplier profile could not be marked", async () => {
    const { steps } = fakeSteps({ markSucceeds: false });

    await expect(createProfileForNewUser(NEW_USER, callWith("supplier"), steps)).rejects.toThrow(
      'Perfil de fornecedor não gravado: organização "org-1" não encontrada.',
    );
  });
});

describe("isSelfSignUpPath", () => {
  it("reads the choice on the e-mail sign-up and the Google callback", () => {
    expect(isSelfSignUpPath("/sign-up/email")).toBe(true);
    expect(isSelfSignUpPath("/callback/:id")).toBe(true);
    expect(isSelfSignUpPath("/callback/google")).toBe(true);
  });

  it("keeps an account made by the team a seller, whatever the team member's browser chose", () => {
    expect(isSelfSignUpPath("/admin/create-user")).toBe(false);
  });
});
