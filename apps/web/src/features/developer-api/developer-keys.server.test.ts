import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDeveloperApiKey: vi.fn<(database: unknown, key: Record<string, unknown>) => unknown>(),
  listDeveloperApiKeys: vi.fn<() => Promise<unknown[]>>(),
  revokeDeveloperApiKey: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@sellbridge/database/repositories", () => mocks);

const { issueDeveloperKey, revokeOwnDeveloperKey } = await import("./developer-keys.server");

const NOW = new Date("2026-11-25T12:00:00Z");
const request = { name: "Painel", scopes: ["orders:read" as const], validity: "30" as const };

function storedKey(overrides: Record<string, unknown> = {}) {
  return {
    id: "key-1",
    name: "Painel",
    prefix: "sb_dev_abcdef",
    scopes: ["orders:read"],
    lastUsedAt: null,
    expiresAt: new Date("2026-12-25T12:00:00Z"),
    revokedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listDeveloperApiKeys.mockResolvedValue([]);
  mocks.createDeveloperApiKey.mockImplementation(async (_database, key) => storedKey(key));
});

describe("issueDeveloperKey", () => {
  it("stores the hash and an expiration, and returns the secret only to the caller", async () => {
    const issued = await issueDeveloperKey({ userId: "dev-1", request, now: NOW });

    const stored = mocks.createDeveloperApiKey.mock.calls[0]?.[1];
    expect(issued.secret.startsWith("sb_dev_")).toBe(true);
    expect(stored?.secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(issued.secret);
    expect(stored?.expiresAt).toEqual(new Date("2026-12-25T12:00:00Z"));
    expect(stored?.createdByUserId).toBe("dev-1");
  });

  it("refuses a new key past the limit of active keys", async () => {
    mocks.listDeveloperApiKeys.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => storedKey({ id: `key-${index}` })),
    );

    await expect(issueDeveloperKey({ userId: "dev-1", request, now: NOW })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mocks.createDeveloperApiKey).not.toHaveBeenCalled();
  });

  it("does not count revoked keys toward the limit", async () => {
    mocks.listDeveloperApiKeys.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => storedKey({ id: `key-${index}`, revokedAt: NOW })),
    );

    await issueDeveloperKey({ userId: "dev-1", request, now: NOW });

    expect(mocks.createDeveloperApiKey).toHaveBeenCalledOnce();
  });
});

describe("revokeOwnDeveloperKey", () => {
  it("revokes only among the developer's own keys", async () => {
    await revokeOwnDeveloperKey({ userId: "dev-1", developerApiKeyId: "key-1", now: NOW });

    expect(mocks.revokeDeveloperApiKey).toHaveBeenCalledWith({}, "dev-1", "key-1", NOW);
  });
});
