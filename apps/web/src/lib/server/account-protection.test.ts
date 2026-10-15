import type { AccountIdentity } from "@sellbridge/shared/platform-owner";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_ACTION_PATHS,
  type AccountDirectory,
  assertMayActOnAccount,
} from "./account-protection";

const OWNER_EMAILS = ["dona@sellbridge.test"];

const ACCOUNTS: Record<string, AccountIdentity> = {
  owner: { email: "dona@sellbridge.test", emailVerified: true, role: "admin" },
  admin: { email: "admin@sellbridge.test", emailVerified: true, role: "admin" },
  agent: { email: "atendente@sellbridge.test", emailVerified: true, role: "agent" },
  reseller: { email: "loja@sellbridge.test", emailVerified: true, role: "user" },
};

const SESSIONS: Record<string, string> = { "token-da-dona": "owner", "token-da-loja": "reseller" };

const directory: AccountDirectory = {
  findAccount: async (userId) => ACCOUNTS[userId] ?? null,
  findSessionUserId: async (sessionToken) => SESSIONS[sessionToken] ?? null,
};

function bodyFor(path: string, target: string): Record<string, unknown> {
  if (path === "/admin/revoke-user-session") {
    return { sessionToken: target === "owner" ? "token-da-dona" : "token-da-loja" };
  }
  if (path === "/admin/set-role") {
    return { userId: target, role: "user" };
  }
  if (path === "/admin/update-user") {
    return { userId: target, data: { name: "Nome novo" } };
  }
  return { userId: target };
}

async function attempt(actor: keyof typeof ACCOUNTS, path: string, target: string) {
  try {
    await assertMayActOnAccount(
      { path, body: bodyFor(path, target), actor: ACCOUNTS[actor] ?? null },
      directory,
      OWNER_EMAILS,
    );
    return "allowed";
  } catch (error) {
    return error instanceof Error && "status" in error ? String(error.status) : "other error";
  }
}

/** Routes that name an existing account (create-user names a new one, see below). */
const USER_TARGET_PATHS = [...ACCOUNT_ACTION_PATHS].filter((path) => path !== "/admin/create-user");

async function attemptBody(actor: keyof typeof ACCOUNTS, path: string, body: unknown) {
  try {
    await assertMayActOnAccount(
      { path, body, actor: ACCOUNTS[actor] ?? null },
      directory,
      OWNER_EMAILS,
    );
    return "allowed";
  } catch (error) {
    return error instanceof Error && "status" in error ? String(error.status) : "other error";
  }
}

describe("assertMayActOnAccount", () => {
  it.each(USER_TARGET_PATHS)("refuses an ordinary admin on the owner: %s", async (path) => {
    expect(await attempt("admin", path, "owner")).toBe("FORBIDDEN");
  });

  it.each(USER_TARGET_PATHS.filter((path) => path !== "/admin/revoke-user-session"))(
    "refuses an ordinary admin on the team: %s",
    async (path) => {
      expect(await attempt("admin", path, "agent")).toBe("FORBIDDEN");
    },
  );

  it.each(USER_TARGET_PATHS)("lets an owner and any admin on a reseller: %s", async (path) => {
    expect(await attempt("owner", path, "reseller")).toBe("allowed");
    expect(await attempt("admin", path, "reseller")).toBe("allowed");
  });

  it("refuses an ordinary admin bringing someone into the team, in any role format", async () => {
    for (const role of ["agent", "admin", ["user", "admin"], "user,supervisor"]) {
      expect(await attemptBody("admin", "/admin/set-role", { userId: "reseller", role })).toBe(
        "FORBIDDEN",
      );
    }
    expect(
      await attemptBody("admin", "/admin/update-user", {
        userId: "reseller",
        data: { role: "admin" },
      }),
    ).toBe("FORBIDDEN");
    expect(
      await attemptBody("owner", "/admin/set-role", { userId: "reseller", role: "agent" }),
    ).toBe("allowed");
    expect(
      await attemptBody("admin", "/admin/set-role", { userId: "reseller", role: "user" }),
    ).toBe("allowed");
  });

  it("refuses an ordinary admin moving an account to an owner's address", async () => {
    const update = {
      userId: "reseller",
      data: { email: "Dona@sellbridge.test", emailVerified: true },
    };
    expect(await attemptBody("admin", "/admin/update-user", update)).toBe("FORBIDDEN");
    expect(await attemptBody("owner", "/admin/update-user", update)).toBe("allowed");
    expect(
      await attemptBody("admin", "/admin/update-user", {
        userId: "reseller",
        data: { email: "nova@sellbridge.test" },
      }),
    ).toBe("allowed");
  });

  it("reads the new e-mail the way the plugin does (a list becomes its text)", async () => {
    const update = { userId: "reseller", data: { email: ["dona@sellbridge.test"] } };
    expect(await attemptBody("admin", "/admin/update-user", update)).toBe("FORBIDDEN");
  });

  it("refuses a change it cannot read unless an owner asks", async () => {
    for (const [path, body] of [
      ["/admin/update-user", { userId: "reseller", data: "texto" }],
      ["/admin/set-role", { userId: "reseller", role: { admin: true } }],
      ["/admin/create-user", { name: "Nova" }],
    ] as const) {
      expect(await attemptBody("admin", path, body)).toBe("FORBIDDEN");
      expect(await attemptBody("owner", path, body)).toBe("allowed");
    }
  });

  it("refuses an ordinary admin creating an owner's address or a team account", async () => {
    const base = { name: "Nova", password: "senha-segura-123" };
    const ownerAddress = { ...base, email: "dona@sellbridge.test", data: { emailVerified: true } };
    expect(await attemptBody("admin", "/admin/create-user", ownerAddress)).toBe("FORBIDDEN");
    expect(
      await attemptBody("admin", "/admin/create-user", {
        ...base,
        email: "nova@sellbridge.test",
        role: "admin",
      }),
    ).toBe("FORBIDDEN");
    expect(
      await attemptBody("admin", "/admin/create-user", {
        ...base,
        email: "nova@sellbridge.test",
        data: { role: "agent" },
      }),
    ).toBe("FORBIDDEN");
    expect(
      await attemptBody("admin", "/admin/create-user", { ...base, email: "nova@sellbridge.test" }),
    ).toBe("allowed");
    expect(await attemptBody("owner", "/admin/create-user", ownerAddress)).toBe("allowed");
  });

  it("lets an owner act on the team", async () => {
    expect(await attempt("owner", "/admin/set-role", "admin")).toBe("allowed");
    expect(await attempt("owner", "/admin/ban-user", "agent")).toBe("allowed");
  });

  it("reads the user id the way the plugin does (a number is coerced)", async () => {
    const numericOwner = {
      ...directory,
      findAccount: async (id: string) => (id === "42" ? (ACCOUNTS.owner ?? null) : null),
    };
    await expect(
      assertMayActOnAccount(
        { path: "/admin/set-user-password", body: { userId: 42 }, actor: ACCOUNTS.admin ?? null },
        numericOwner,
        OWNER_EMAILS,
      ),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  it("leaves other routes, unknown targets and anonymous calls to the plugin", async () => {
    expect(await attempt("admin", "/admin/list-users", "owner")).toBe("allowed");
    expect(await attempt("admin", "/admin/ban-user", "ninguem")).toBe("allowed");
    await expect(
      assertMayActOnAccount(
        { path: "/admin/ban-user", body: { userId: "owner" }, actor: null },
        directory,
        OWNER_EMAILS,
      ),
    ).resolves.toBeUndefined();
  });
});
