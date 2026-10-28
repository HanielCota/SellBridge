import { describe, expect, it } from "vitest";
import { type AdminAccessAccount, settleAdminAccess } from "./admin-promotion.ts";

const ADMIN_ADDRESS = "dona@sellbridge.local";

function fakeSteps(account: AdminAccessAccount | null) {
  const calls = { verified: [] as string[], promoted: [] as string[] };
  return {
    calls,
    steps: {
      findAccount: async () => account,
      isAdminAddress: (email: string) => email === ADMIN_ADDRESS,
      sendVerificationEmail: async (email: string) => {
        calls.verified.push(email);
      },
      promote: async ({ userId }: { userId: string; email: string }) => {
        calls.promoted.push(userId);
      },
    },
  };
}

describe("settleAdminAccess", () => {
  it("promotes an admin address whose mailbox was already proven", async () => {
    const { calls, steps } = fakeSteps({ email: ADMIN_ADDRESS, emailVerified: true });

    await settleAdminAccess("user-1", steps);

    expect(calls.promoted).toEqual(["user-1"]);
    expect(calls.verified).toEqual([]);
  });

  it("asks an unproven admin address for the verification link instead of promoting", async () => {
    const { calls, steps } = fakeSteps({ email: ADMIN_ADDRESS, emailVerified: false });

    await settleAdminAccess("user-1", steps);

    expect(calls.verified).toEqual([ADMIN_ADDRESS]);
    expect(calls.promoted).toEqual([]);
  });

  it("leaves an address outside the list alone, verified or not", async () => {
    const { calls, steps } = fakeSteps({ email: "lojista@exemplo.com", emailVerified: true });

    await settleAdminAccess("user-1", steps);

    expect(calls.verified).toEqual([]);
    expect(calls.promoted).toEqual([]);
  });

  it("does nothing when the session points at an account that no longer exists", async () => {
    const { calls, steps } = fakeSteps(null);

    await settleAdminAccess("user-1", steps);

    expect(calls.verified).toEqual([]);
    expect(calls.promoted).toEqual([]);
  });
});
