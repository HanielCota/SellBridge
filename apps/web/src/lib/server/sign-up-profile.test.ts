import { SIGN_UP_PROFILE_COOKIE } from "@sellbridge/shared/sign-up-profile";
import { describe, expect, it } from "vitest";
import {
  createProfileForNewUser,
  isSelfSignUpPath,
  type SignUpRequest,
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

function requestWith(cookie?: string): SignUpRequest {
  return {
    getCookie: (name) => (name === SIGN_UP_PROFILE_COOKIE ? cookie : undefined),
  };
}

describe("createProfileForNewUser", () => {
  it("creates a seller profile without marking it when no kind is chosen", async () => {
    const { calls, steps } = fakeSteps();

    const kind = await createProfileForNewUser(NEW_USER, requestWith(), steps);

    expect(kind).toBe("seller");
    expect(calls.created).toEqual(["user-1"]);
    expect(calls.marked).toEqual([]);
  });

  it("marks the new profile as a supplier when the sign-up page chose it", async () => {
    const { calls, steps } = fakeSteps();

    const kind = await createProfileForNewUser(NEW_USER, requestWith("supplier"), steps);

    expect(kind).toBe("supplier");
    expect(calls.marked).toEqual(["org-1:supplier"]);
  });

  it("creates a seller profile when the account comes from a server call", async () => {
    const { calls, steps } = fakeSteps();

    expect(await createProfileForNewUser(NEW_USER, null, steps)).toBe("seller");
    expect(calls.marked).toEqual([]);
  });

  it("fails loudly when the supplier profile could not be marked", async () => {
    const { steps } = fakeSteps({ markSucceeds: false });

    await expect(createProfileForNewUser(NEW_USER, requestWith("supplier"), steps)).rejects.toThrow(
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
