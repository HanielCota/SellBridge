import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isUserEmailVerified: vi.fn<(database: unknown, userId: string) => Promise<boolean>>(),
  transaction: vi.fn<(work: (transaction: unknown) => Promise<unknown>) => Promise<unknown>>(),
  createApiKey: vi.fn<() => Promise<unknown>>(),
  listApiKeys: vi.fn<() => Promise<unknown[]>>(),
  lockBillingTenant: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/lib/server/database", () => ({ database: { transaction: mocks.transaction } }));
vi.mock("@sellbridge/database/repositories", () => ({
  isUserEmailVerified: mocks.isUserEmailVerified,
  createApiKey: mocks.createApiKey,
  listApiKeys: mocks.listApiKeys,
  lockBillingTenant: mocks.lockBillingTenant,
  revokeApiKey: vi.fn<() => Promise<void>>(),
}));

const { issueApiKey } = await import("./api-keys.server");

const request = { name: "ERP", scopes: ["orders:read" as const], expiresAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (work) => work({}));
  mocks.listApiKeys.mockResolvedValue([]);
  mocks.createApiKey.mockResolvedValue({
    id: "key-1",
    prefix: "sb_live_abcd",
    scopes: ["orders:read"],
  });
});

describe("issueApiKey", () => {
  // Regression (security audit, 26/10/2026): an account signed up with someone else's address
  // could mint a key before confirming it, and the key outlived the owner's password reset.
  it("refuses a key to an account whose e-mail is not confirmed", async () => {
    mocks.isUserEmailVerified.mockResolvedValue(false);

    await expect(
      issueApiKey({ tenantId: "tenant-a", userId: "user-1", request }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      userMessage: "Confirme seu e-mail antes de criar chaves de API.",
    });
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });

  it("issues a key to an account with a confirmed e-mail", async () => {
    mocks.isUserEmailVerified.mockResolvedValue(true);

    const issued = await issueApiKey({ tenantId: "tenant-a", userId: "user-1", request });

    expect(issued.secret).toMatch(/^sb_live_/);
    expect(mocks.isUserEmailVerified).toHaveBeenCalledWith(expect.anything(), "user-1");
  });
});
